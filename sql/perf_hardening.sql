-- 새벽민턴 성능·보안 점검 후 조치 (2026-07-11, DB 반영됨)
-- ① stock_trades_archive RLS 활성화 (service 전용, 정책 없음 = 익명/일반 접근 차단)
alter table public.stock_trades_archive enable row level security;
-- ② SECURITY DEFINER 함수 search_path 고정 (하이재킹 방어)
alter function public.handle_new_user() set search_path = public;
alter function public.update_avatar_url(uuid, text) set search_path = public;
-- ③ 자주 조회되는 컬럼 인덱스 (matches 슬롯·status·날짜, logs·shop FK)
create index if not exists idx_matches_status_date on public.matches(status, match_date desc);
create index if not exists idx_matches_a1 on public.matches(a1_id);
create index if not exists idx_matches_a2 on public.matches(a2_id);
create index if not exists idx_matches_b1 on public.matches(b1_id);
create index if not exists idx_matches_b2 on public.matches(b2_id);
create index if not exists idx_matches_submitter on public.matches(submitter_id);
create index if not exists idx_logs_user on public.logs(user_id);
create index if not exists idx_shop_purchases_user on public.shop_purchases(user_id);
