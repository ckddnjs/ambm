-- ══════════════════════════════════════════════════════════════
-- 새벽민턴 주식 매수·매도 서버 검증 RPC (2026-07-11)
-- Supabase 대시보드 → SQL Editor에서 이 파일 전체를 실행하세요.
-- 목적: 가격·잔액·보유수량 검증을 전부 서버에서 수행 — 클라이언트가
--       가격/수량을 조작해 호출해도 서버가 경기 데이터로 재계산하므로 무력화.
-- ══════════════════════════════════════════════════════════════

-- ① 서버 기준 주가: CI(시즌 경기 기반) - 900, 최소 10, 5경기 미만은 비상장(null)
--    클라이언트 calcCI와 동일 공식 (JS Math.round = floor(x+0.5)로 재현)
create or replace function public.ambm_stock_price(p_stock uuid)
returns int
language plpgsql stable security definer set search_path = public
as $$
declare
  ss text; season int := 1; cap int;
  g int := 0; w int := 0; d int := 0; cw int := 0;
  rec record; ci numeric;
begin
  select value into ss from app_settings where key = 'season_start';
  begin
    select coalesce(nullif(value,'')::int, 1) into season from app_settings where key = 'current_season';
  exception when others then season := 1; end;
  cap := case when coalesce(season,1) >= 2 then 50 else 30 end;

  for rec in
    select score_a, score_b, (a1_id = p_stock or a2_id = p_stock) as on_a
    from matches
    where status = 'approved'
      and (coalesce(ss,'') = '' or match_date::text >= ss)
      and (a1_id = p_stock or a2_id = p_stock or b1_id = p_stock or b2_id = p_stock)
  loop
    g := g + 1;
    if (rec.on_a and rec.score_a > rec.score_b) or ((not rec.on_a) and rec.score_b > rec.score_a) then
      w := w + 1;
      if abs(rec.score_a - rec.score_b) <= 3 then cw := cw + 1; end if;
    end if;
    d := d + case when rec.on_a then rec.score_a - rec.score_b else rec.score_b - rec.score_a end;
  end loop;

  if g < 5 then return null; end if;   -- 5경기 미만 = 비상장

  ci := 1000
      + floor((w::numeric / g) * (g::numeric / (g + 15)) * 200 + 0.5)  -- 신뢰도 보정 승률 점수
      + floor((d::numeric / g) * 5 + 0.5)                              -- 평균 득실차 점수
      + least(g, cap)                                                  -- 참가 경기 가산점
      + cw;                                                            -- 접전 승리 가산점
  return greatest(10, (ci - 900)::int);
end $$;

-- ② 거래 정지 시간 판정 (app_settings.trading_halt JSON, KST 기준 — 클라이언트와 동일 로직)
create or replace function public.ambm_trading_halted()
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  halts jsonb; h jsonb; nowk timestamp;
  curday int; curmin int; sd int; ed int; sm int; em int; hit boolean;
begin
  begin
    select value::jsonb into halts from app_settings where key = 'trading_halt';
  exception when others then return false; end;
  if halts is null or jsonb_typeof(halts) <> 'array' or jsonb_array_length(halts) = 0 then return false; end if;
  nowk := (now() at time zone 'Asia/Seoul');
  curday := extract(dow from nowk)::int;
  curmin := extract(hour from nowk)::int * 60 + extract(minute from nowk)::int;
  for h in select * from jsonb_array_elements(halts) loop
    begin
      sd := (h->>'startDay')::int; ed := (h->>'endDay')::int;
      sm := split_part(h->>'startTime', ':', 1)::int * 60 + split_part(h->>'startTime', ':', 2)::int;
      em := split_part(h->>'endTime',   ':', 1)::int * 60 + split_part(h->>'endTime',   ':', 2)::int;
    exception when others then continue; end;
    if sd <= ed then
      hit := not (curday < sd or curday > ed)
             and not (curday = sd and curmin < sm)
             and not (curday = ed and curmin >= em);
    else
      hit := not (curday > ed and curday < sd)
             and not (curday = sd and curmin < sm)
             and not (curday = ed and curmin >= em);
    end if;
    if hit then return true; end if;
  end loop;
  return false;
end $$;

-- ③ 매수: 가격은 서버 계산, 잔액 검증·차감·포트폴리오·거래로그 원자 처리
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
  select cash into bal from stock_wallets where user_id = uid;
  if bal is null then bal := 2000; end if;      -- 지갑 미생성 = 초기 지급 2000P
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
  insert into stock_wallets(user_id, cash) values(uid, bal - total)
    on conflict (user_id) do update set cash = bal - total;
  insert into stock_trades(user_id, action, name, qty, price, total) values(uid, 'buy', nm, p_qty, px, total);
  return jsonb_build_object('ok', true, 'price', px, 'total', total, 'cash', bal - total);
end $$;

-- ④ 매도: 보유 수량 검증·평단 기반 손익 계산 원자 처리
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
  select coalesce(cash, 2000) into bal from stock_wallets where user_id = uid;
  if bal is null then bal := 2000; end if;
  insert into stock_wallets(user_id, cash) values(uid, bal + total)
    on conflict (user_id) do update set cash = bal + total;
  insert into stock_trades(user_id, action, name, qty, price, total, cost, pnl)
    values(uid, 'sell', nm, p_qty, px, total, costbasis, pnl);
  return jsonb_build_object('ok', true, 'price', px, 'total', total, 'pnl', pnl);
end $$;

-- ⑤ 권한: 로그인 사용자만 호출 가능
revoke all on function public.stock_buy(uuid, integer) from public, anon;
revoke all on function public.stock_sell(uuid, integer) from public, anon;
grant execute on function public.stock_buy(uuid, integer) to authenticated;
grant execute on function public.stock_sell(uuid, integer) to authenticated;

-- (선택·권장) RPC 전환 후 직접 쓰기 봉쇄 — 클라이언트 폴백 코드 제거 뒤 실행:
-- revoke insert, update, delete on stock_wallets, stock_portfolio, stock_trades from authenticated;
