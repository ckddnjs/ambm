-- ══════════════════════════════════════════════════════════════
-- 새벽민턴 보안 강화 1·2순위 (2026-07-11) — 이미 DB 적용됨 (기록용)
-- ① matches 정책 분리: 등록=본인 pending만, 승인·수정·삭제=admin만
-- ② 제작소 전체 서버 검증: 구매·제작(성공판정 포함)·재활용·교환 RPC + 인벤 직접쓰기 봉쇄
-- ══════════════════════════════════════════════════════════════

-- admin 판별 헬퍼
create or replace function public.ambm_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- ── ① matches 정책 재편 ──
drop policy if exists matches_all on public.matches;
drop policy if exists matches_select on public.matches;
drop policy if exists matches_insert on public.matches;
drop policy if exists matches_update_admin on public.matches;
drop policy if exists matches_delete_admin on public.matches;
create policy matches_select on public.matches for select using (true);
create policy matches_insert on public.matches for insert to authenticated
  with check ( ambm_is_admin() or (submitter_id = auth.uid() and status = 'pending') );
create policy matches_update_admin on public.matches for update to authenticated
  using (ambm_is_admin()) with check (ambm_is_admin());
create policy matches_delete_admin on public.matches for delete to authenticated
  using (ambm_is_admin());

-- 게스트 경기 연결(가입/로그인 시): 본인 이름과 일치하는 id-null 슬롯만 서버에서 연결
create or replace function public.link_guest_matches()
returns integer language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); nm text; n int := 0; r int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select name into nm from profiles where id = uid;
  if nm is null or nm = '' then return 0; end if;
  update matches set a1_id = uid where a1_name = nm and a1_id is null; get diagnostics r = row_count; n := n + r;
  update matches set a2_id = uid where a2_name = nm and a2_id is null; get diagnostics r = row_count; n := n + r;
  update matches set b1_id = uid where b1_name = nm and b1_id is null; get diagnostics r = row_count; n := n + r;
  update matches set b2_id = uid where b2_name = nm and b2_id is null; get diagnostics r = row_count; n := n + r;
  return n;
end $$;
revoke all on function public.link_guest_matches() from public, anon;
grant execute on function public.link_guest_matches() to authenticated;

-- ── ② 제작소 서버 검증 ──
-- 아이템 가격: 기본가 + app_settings.market_prices(JSON) 오버라이드 (클라와 동일)
create or replace function public.ambm_item_price(p_item text)
returns int language plpgsql stable security definer set search_path = public
as $$
declare base int; ov jsonb; px int;
begin
  base := case p_item
    when 'feather_bundle' then 400 when 'cork' then 400
    when 'thread' then 200 when 'tape' then 200
    when 'artisan_craft' then 4000 when 'recycle' then 6000
    else null end;
  if base is null then return null; end if;
  begin
    select value::jsonb into ov from app_settings where key = 'market_prices';
    if ov ? p_item then px := (ov->>p_item)::int; end if;
  exception when others then px := null; end;
  return coalesce(px, base);
end $$;

-- 인벤 행 보장 (내부용)
create or replace function public._ambm_inv_ensure(p_uid uuid)
returns void language sql security definer set search_path = public
as $$ insert into market_inventory(user_id, feather, cork, thread, tape, artisan, recycle, shuttles, defective)
      values(p_uid, 0,0,0,0,0,0,0,0) on conflict (user_id) do nothing $$;

-- 재료 구매: 가격 서버 검증 + 현금 차감 + 구매기록 + 인벤 지급 원자 처리
create or replace function public.shop_buy(p_item text, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid(); px int; total int; bal int;
  col text; addq int; nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 100 then raise exception 'invalid qty'; end if;
  px := ambm_item_price(p_item);
  if px is null then raise exception 'unknown item'; end if;
  select case p_item
    when 'feather_bundle' then 'feather' when 'cork' then 'cork'
    when 'thread' then 'thread' when 'tape' then 'tape'
    when 'artisan_craft' then 'artisan' when 'recycle' then 'recycle' end into col;
  addq := case when p_item = 'feather_bundle' then 4 else 1 end * p_qty;
  nm := case p_item
    when 'feather_bundle' then '깃털 번들' when 'cork' then '코르크'
    when 'thread' then '실' when 'tape' then '띠지'
    when 'artisan_craft' then '장인의 손길' when 'recycle' then '재활용의 손길' end;
  total := px * p_qty;
  select cash into bal from stock_wallets where user_id = uid for update;
  if bal is null then bal := 2000; end if;
  if total > bal then raise exception 'insufficient cash'; end if;
  insert into stock_wallets(user_id, cash) values(uid, bal - total)
    on conflict (user_id) do update set cash = bal - total;
  insert into shop_purchases(user_id, item, price, qty) values(uid, nm, total, p_qty);
  perform _ambm_inv_ensure(uid);
  execute format('update market_inventory set %I = coalesce(%I,0) + $1 where user_id = $2', col, col) using addq, uid;
  return jsonb_build_object('ok', true, 'price', px, 'total', total, 'added', addq);
end $$;

-- 제작: 재료 검증·차감 + 성공 판정(서버 난수, flight_rate) + 결과 반영 원자 처리
create or replace function public.craft_start(p_use_artisan boolean)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid(); inv record; rate numeric := 40; cfg jsonb; ok boolean; used_art boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform _ambm_inv_ensure(uid);
  select * into inv from market_inventory where user_id = uid for update;
  if coalesce(inv.feather,0) < 16 or coalesce(inv.cork,0) < 1
     or coalesce(inv.thread,0) < 1 or coalesce(inv.tape,0) < 1 then
    raise exception 'insufficient materials';
  end if;
  if coalesce(p_use_artisan, false) then
    if coalesce(inv.artisan,0) < 1 then raise exception 'no artisan item'; end if;
    used_art := true;
  end if;
  begin
    select value::jsonb into cfg from app_settings where key = 'market_config';
    if cfg ? 'flight_rate' then rate := (cfg->>'flight_rate')::numeric; end if;
  exception when others then rate := 40; end;
  ok := used_art or (random() < rate / 100.0);
  update market_inventory set
    feather = coalesce(feather,0) - 16,
    cork = coalesce(cork,0) - 1,
    thread = coalesce(thread,0) - 1,
    tape = coalesce(tape,0) - 1,
    artisan = coalesce(artisan,0) - case when used_art then 1 else 0 end,
    shuttles = coalesce(shuttles,0) + case when ok then 1 else 0 end,
    defective = coalesce(defective,0) + case when ok then 0 else 1 end
  where user_id = uid;
  return jsonb_build_object('ok', true, 'success', ok, 'artisan', used_art);
end $$;

-- 재활용: 불량 1 + 재활용권 1 → 셔틀콕 1
create or replace function public.craft_recycle()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); inv record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from market_inventory where user_id = uid for update;
  if inv is null or coalesce(inv.defective,0) < 1 then raise exception 'no defective'; end if;
  if coalesce(inv.recycle,0) < 1 then raise exception 'no recycle item'; end if;
  update market_inventory set
    recycle = coalesce(recycle,0) - 1,
    defective = coalesce(defective,0) - 1,
    shuttles = coalesce(shuttles,0) + 1
  where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- 셔틀콕 실물 교환 요청: 차감 + 로그 원자 처리
create or replace function public.shuttle_exchange(p_qty integer, p_memo text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); inv record; nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'invalid qty'; end if;
  select * into inv from market_inventory where user_id = uid for update;
  if inv is null or coalesce(inv.shuttles,0) < p_qty then raise exception 'not enough shuttles'; end if;
  select name into nm from profiles where id = uid;
  update market_inventory set shuttles = coalesce(shuttles,0) - p_qty where user_id = uid;
  insert into logs(user_id, action, note, created_at)
    values(uid, 'shuttle_exchange_request',
      jsonb_build_object('qty', p_qty, 'memo', coalesce(p_memo,''), 'status', 'pending', 'userName', coalesce(nm,''))::text,
      now());
  return jsonb_build_object('ok', true);
end $$;

-- 권한
revoke all on function public.shop_buy(text, integer) from public, anon;
revoke all on function public.craft_start(boolean) from public, anon;
revoke all on function public.craft_recycle() from public, anon;
revoke all on function public.shuttle_exchange(integer, text) from public, anon;
revoke all on function public._ambm_inv_ensure(uuid) from public, anon, authenticated;
grant execute on function public.shop_buy(text, integer) to authenticated;
grant execute on function public.craft_start(boolean) to authenticated;
grant execute on function public.craft_recycle() to authenticated;
grant execute on function public.shuttle_exchange(integer, text) to authenticated;

-- 인벤토리 직접 쓰기 봉쇄 (RPC로만 변경 가능 — 실물 교환 재화라 필수)
revoke insert, update, delete on table public.market_inventory from authenticated, anon;
