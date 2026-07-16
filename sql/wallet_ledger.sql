-- ══════════════════════════════════════════════════════════════
-- 지갑 원장(wallet_ledger) + 감사 트리거 + 직접쓰기 봉쇄 (2026-07-16)
-- 배경: 김종호 포인트 유실(기록 없는 지갑 덮어쓰기, RPC 도입 전 클라 직접쓰기
--       시절 stale write 추정) 사후 대책. DB에 migration
--       'wallet_ledger_and_lockdown'으로 적용 완료.
-- 효과:
--   · 모든 지갑 변경(RPC·서비스키·수동 SQL)이 wallet_ledger에 자동 기록
--   · stock_wallets/wallets 클라 직접 INSERT/UPDATE/DELETE 봉쇄
--   · stock_buy/sell 행 잠금(for update)으로 동시호출 레이스 제거
--   · stock_trades_archive RLS 활성(관리자 조회만)
-- 클라 변경: stockmarket.js 지갑 시드 insert 제거(첫 거래 RPC가 생성)
-- ══════════════════════════════════════════════════════════════

-- 1) 원장 테이블 (append-only)
create table if not exists public.wallet_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  wallet text not null,          -- 'stock' | 'savings'
  before int,                    -- INSERT(지갑 생성) 시 null
  after int not null,
  diff int not null,
  reason text,                   -- RPC가 set_config('ambm.reason', ...)로 태깅
  actor uuid,                    -- auth.uid() (관리자 대리 수정 추적)
  db_role text,                  -- authenticated / service_role / postgres(SQL)
  created_at timestamptz not null default now()
);
create index if not exists wallet_ledger_user_idx on public.wallet_ledger(user_id, created_at desc);

alter table public.wallet_ledger enable row level security;
drop policy if exists wallet_ledger_select_own on public.wallet_ledger;
create policy wallet_ledger_select_own on public.wallet_ledger
  for select using (auth.uid() = user_id or public.ambm_is_admin());
revoke insert, update, delete on public.wallet_ledger from anon, authenticated;
grant select on public.wallet_ledger to authenticated;

-- 2) 감사 트리거 (모든 지갑 변경을 예외 없이 기록)
create or replace function public.ambm_wallet_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  b int; a int; w text; r text;
begin
  if tg_table_name = 'stock_wallets' then
    w := 'stock';
    if tg_op = 'UPDATE' then b := old.cash; end if;
    a := new.cash;
  else
    w := 'savings';
    if tg_op = 'UPDATE' then b := old.balance; end if;
    a := new.balance;
  end if;
  if tg_op = 'UPDATE' and a = b then return new; end if;  -- 변동 없으면 스킵
  begin
    r := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
      nullif(current_setting('request.jwt.claim.role', true), ''));
  exception when others then r := null; end;
  insert into public.wallet_ledger(user_id, wallet, before, after, diff, reason, actor, db_role)
  values (new.user_id, w, b, a, a - coalesce(b, 0),
          nullif(current_setting('ambm.reason', true), ''),
          auth.uid(), coalesce(r, current_user::text));
  return new;
end $$;
revoke all on function public.ambm_wallet_audit() from public, anon, authenticated;

drop trigger if exists trg_wallet_audit on public.stock_wallets;
create trigger trg_wallet_audit
  after insert or update on public.stock_wallets
  for each row execute function public.ambm_wallet_audit();

drop trigger if exists trg_wallet_audit_sav on public.wallets;
create trigger trg_wallet_audit_sav
  after insert or update on public.wallets
  for each row execute function public.ambm_wallet_audit();

-- 3) stock_buy / stock_sell 재작성: 행 잠금(for update) + 원장 reason 태깅
--    (전문은 stock_trade_rpc.sql 기반 + 아래 두 줄 차이)
--    · select cash into bal from stock_wallets where user_id = uid FOR UPDATE;
--    · perform set_config('ambm.reason', 'stock_buy'|'stock_sell', true);  -- 지갑 쓰기 직전
create or replace function public.stock_buy(p_stock uuid, p_qty integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid(); px int; total int; bal int;
  ex record; nm text; ns int; newavg int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then raise exception 'invalid qty'; end if;
  if ambm_trading_halted() then raise exception 'trading halted'; end if;
  px := ambm_stock_price(p_stock);
  if px is null then raise exception 'not a listed stock'; end if;
  total := px * p_qty;
  select cash into bal from stock_wallets where user_id = uid for update;
  if bal is null then bal := 2000; end if;
  if total > bal then raise exception 'insufficient cash'; end if;
  select name into nm from profiles where id = p_stock;
  select * into ex from stock_portfolio where user_id = uid and stock_user_id = p_stock;
  if found then
    ns := ex.shares + p_qty;
    newavg := round((ex.avg_price::numeric * ex.shares + px::numeric * p_qty) / ns);
    update stock_portfolio set shares = ns, avg_price = newavg where id = ex.id;
  else
    insert into stock_portfolio(user_id, stock_user_id, shares, avg_price) values(uid, p_stock, p_qty, px);
  end if;
  perform set_config('ambm.reason', 'stock_buy', true);
  insert into stock_wallets(user_id, cash) values(uid, bal - total)
    on conflict (user_id) do update set cash = bal - total;
  insert into stock_trades(user_id, action, name, qty, price, total) values(uid, 'buy', nm, p_qty, px, total);
  return jsonb_build_object('ok', true, 'price', px, 'total', total, 'cash', bal - total);
end $$;

create or replace function public.stock_sell(p_stock uuid, p_qty integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid(); px int; total int;
  ex record; nm text; costbasis int; pnl int; bal int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'invalid qty'; end if;
  if ambm_trading_halted() then raise exception 'trading halted'; end if;
  select * into ex from stock_portfolio where user_id = uid and stock_user_id = p_stock;
  if not found or p_qty > ex.shares then raise exception 'not enough shares'; end if;
  px := ambm_stock_price(p_stock);
  if px is null then raise exception 'not a listed stock'; end if;
  total := px * p_qty;
  costbasis := coalesce(ex.avg_price, 0) * p_qty;
  pnl := total - costbasis;
  select name into nm from profiles where id = p_stock;
  if p_qty >= ex.shares then delete from stock_portfolio where id = ex.id;
  else update stock_portfolio set shares = ex.shares - p_qty where id = ex.id; end if;
  select cash into bal from stock_wallets where user_id = uid for update;
  if bal is null then bal := 2000; end if;
  perform set_config('ambm.reason', 'stock_sell', true);
  insert into stock_wallets(user_id, cash) values(uid, bal + total)
    on conflict (user_id) do update set cash = bal + total;
  insert into stock_trades(user_id, action, name, qty, price, total, cost, pnl)
    values(uid, 'sell', nm, p_qty, px, total, costbasis, pnl);
  return jsonb_build_object('ok', true, 'price', px, 'total', total, 'pnl', pnl);
end $$;

-- 4) 지갑 직접쓰기 봉쇄 (모든 쓰기 = RPC/서비스키 경유. RPC는 security definer라 무영향)
drop policy if exists stock_wallets_update_own on public.stock_wallets;
drop policy if exists stock_wallets_insert_own on public.stock_wallets;
drop policy if exists wallets_update_own on public.wallets;
drop policy if exists wallets_insert_own on public.wallets;
revoke insert, update, delete on public.stock_wallets from anon, authenticated;
revoke insert, update, delete on public.wallets from anon, authenticated;

-- 5) stock_trades_archive RLS (클라 미사용 — 관리자 조회만, 쓰기는 서비스키 전용)
alter table public.stock_trades_archive enable row level security;
drop policy if exists trades_archive_admin_select on public.stock_trades_archive;
create policy trades_archive_admin_select on public.stock_trades_archive
  for select using (public.ambm_is_admin());
revoke insert, update, delete on public.stock_trades_archive from anon, authenticated;
