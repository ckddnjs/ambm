-- 2026-10-05 프로필 보안 강화
-- 발견: profiles UPDATE/DELETE 정책이 qual=true(누구나·비로그인 포함) → 남의 프로필 수정·삭제, role='admin' 자가 승격 가능.
--       email 칸이 비로그인으로도 조회됨. 대회·커뮤니티·로그 테이블도 비로그인 쓰기 가능.
-- 순서: 1~4 먼저 적용 → 앱 배포(select('*') 제거) → 5(이메일 칸 차단) 적용.

-- 1) 관리자용 이메일 조회 RPC (관리자 화면 회원 목록에서 사용)
create or replace function public.ambm_admin_profile_emails()
returns table(id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ambm_is_admin() then raise exception 'admin only'; end if;
  return query select p.id, p.email from profiles p;
end $$;
revoke all on function public.ambm_admin_profile_emails() from public, anon;
grant execute on function public.ambm_admin_profile_emails() to authenticated;

-- 2) 등급·상태 등 관리자 전용 칸은 관리자/서버만 바꿀 수 있게 (본인 행이라도)
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 직접 DB 접속(MCP·대시보드)과 서비스 키(api/admin/*)는 통과
  if session_user <> 'authenticator' or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if public.ambm_is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.role := 'user'; new.status := 'pending'; new.exclude_stats := false;
    new.wins := 0; new.losses := 0; new.games := 0;
    return new;
  end if;
  new.id := old.id; new.email := old.email; new.role := old.role; new.status := old.status;
  new.provider := old.provider; new.exclude_stats := old.exclude_stats;
  new.wins := old.wins; new.losses := old.losses; new.games := old.games; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- 3) profiles 정책: 수정=본인 또는 관리자, 삭제=관리자, 가입=로그인한 본인만
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.ambm_is_admin())
  with check (id = auth.uid() or public.ambm_is_admin());
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using (public.ambm_is_admin());
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- 4) 비로그인(anon)은 어떤 테이블에도 쓰지 못하게 (앱의 쓰기는 전부 로그인 후 또는 서비스 키)
revoke insert, update, delete, truncate on public.profiles, public.bracket_tournaments, public.community_posts,
  public.logs, public.tournament_likes, public.tournaments from anon;

-- 5) [앱 배포 후] 이메일 칸 조회 차단 — select('*')가 남아 있으면 그 화면이 깨지므로 반드시 배포 뒤에
-- revoke select on public.profiles from anon, authenticated;
-- grant select (id, name, role, status, provider, wins, losses, games, exclude_stats, created_at, updated_at, avatar_url)
--   on public.profiles to anon, authenticated;
