-- ══════════════════════════════════════════════════════════════
-- 셔틀콕 실물 교환 요청 전용 테이블 (2026-07-11) — logs 남용 → 정규 테이블 이관
-- ══════════════════════════════════════════════════════════════

create table if not exists public.shuttle_exchange_requests(
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  user_name   text not null default '',
  qty         int  not null check (qty >= 1),
  memo        text not null default '',
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references profiles(id)
);
create index if not exists idx_ser_status  on public.shuttle_exchange_requests(status, created_at desc);
create index if not exists idx_ser_user    on public.shuttle_exchange_requests(user_id, created_at desc);

alter table public.shuttle_exchange_requests enable row level security;
drop policy if exists ser_select_own_or_admin on public.shuttle_exchange_requests;
create policy ser_select_own_or_admin on public.shuttle_exchange_requests
  for select using (user_id = auth.uid() or ambm_is_admin());
-- INSERT/UPDATE는 RPC(security definer)로만 — 직접 쓰기 미허용 (grant 안 함)

-- ── 기존 logs의 교환 요청 마이그레이션 (중복 방지: 이미 옮긴 건 제외) ──
insert into public.shuttle_exchange_requests(user_id, user_name, qty, memo, status, created_at)
select l.user_id,
       coalesce(l.note::jsonb->>'userName', ''),
       coalesce((l.note::jsonb->>'qty')::int, 1),
       coalesce(l.note::jsonb->>'memo', ''),
       coalesce(l.note::jsonb->>'status', 'pending'),
       l.created_at
from public.logs l
where l.action = 'shuttle_exchange_request'
  and l.user_id is not null
  and not exists (
    select 1 from public.shuttle_exchange_requests s
    where s.user_id = l.user_id and s.created_at = l.created_at
  );

-- 옮긴 로그 정리 (요청 원본 로그만 삭제, 승인/반려 감사로그는 유지)
delete from public.logs where action = 'shuttle_exchange_request';

-- ── 교환 요청 RPC (logs 대신 전용 테이블) ──
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
  insert into shuttle_exchange_requests(user_id, user_name, qty, memo, status)
    values(uid, coalesce(nm,''), p_qty, coalesce(p_memo,''), 'pending');
  return jsonb_build_object('ok', true);
end $$;

-- ── 관리자 승인: 상태만 변경 (셔틀콕은 이미 요청 시 차감됨) ──
create or replace function public.exchange_approve(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not ambm_is_admin() then raise exception 'admin only'; end if;
  update shuttle_exchange_requests
    set status = 'approved', processed_at = now(), processed_by = auth.uid()
    where id = p_id and status = 'pending';
  if not found then raise exception 'not a pending request'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── 관리자 반려: 상태 변경 + 셔틀콕 복구 (원자) ──
create or replace function public.exchange_reject(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  if not ambm_is_admin() then raise exception 'admin only'; end if;
  select * into r from shuttle_exchange_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'not a pending request'; end if;
  update shuttle_exchange_requests
    set status = 'rejected', processed_at = now(), processed_by = auth.uid()
    where id = p_id;
  perform _ambm_inv_ensure(r.user_id);
  update market_inventory set shuttles = coalesce(shuttles,0) + r.qty where user_id = r.user_id;
  return jsonb_build_object('ok', true, 'restored', r.qty);
end $$;

revoke all on function public.exchange_approve(uuid) from public, anon;
revoke all on function public.exchange_reject(uuid)  from public, anon;
grant execute on function public.exchange_approve(uuid) to authenticated;
grant execute on function public.exchange_reject(uuid)  to authenticated;

-- admin_restore_shuttles는 더 이상 사용 안 함 (exchange_reject가 복구 담당)
