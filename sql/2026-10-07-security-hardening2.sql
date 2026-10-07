-- 보안 점검 후속 (2026-10-07)
-- [높음] 가입만 하면(email_confirm=true라 승인 전에도 로그인됨) 선수 이름에 HTML을 넣은 경기를 pending 등록 →
--        관리자 승인 탭에서 이스케이프 없이 렌더돼 관리자 세션에서 스크립트 실행 가능했다.
--        → 이름·메모 칸 DB 제약 + 경기 등록은 승인 회원만 + 클라 escHtml(별도 커밋).
-- [중간] community_posts·tournaments·tournament_likes·bracket_tournaments·logs 가 qual=true ALL 정책이라
--        로그인 회원 누구나 남의 글·대회·대진을 고치거나 로그를 지울 수 있었다.
--        wallet_transfers·shop_purchases 는 클라 사용처가 없는데 본인 명의 임의 insert 가 열려 있었다.
-- 적용 시점 기존 데이터 위반 0건 확인(profiles 이름, matches 선수명·메모).
begin;

-- 승인 회원 판정 (ambm_is_admin과 같은 형태)
create or replace function public.ambm_is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' from profiles where id = auth.uid()), false);
$$;
create or replace function public.ambm_is_writer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' and role in ('admin','writer') from profiles where id = auth.uid()), false);
$$;
revoke all on function public.ambm_is_approved() from public, anon;
revoke all on function public.ambm_is_writer() from public, anon;
grant execute on function public.ambm_is_approved() to authenticated;
grant execute on function public.ambm_is_writer() to authenticated;

-- ── 이름·메모 제약 (HTML 주입 차단)
alter table public.profiles add constraint profiles_name_safe
  check (name is null or (char_length(btrim(name)) between 1 and 20 and name !~ '[<>"''`&\\]'));
alter table public.matches add constraint matches_names_safe
  check (coalesce(a1_name,'') || coalesce(a2_name,'') || coalesce(b1_name,'') || coalesce(b2_name,'') || coalesce(submitter_name,'') !~ '[<>"''`&\\]'
         and greatest(char_length(a1_name), char_length(a2_name), char_length(b1_name), char_length(b2_name)) <= 20);
alter table public.matches add constraint matches_note_safe
  check (coalesce(note,'') || coalesce(admin_note,'') !~ '[<>]');

-- ── 경기 등록: 승인 회원 본인 pending 만
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert to authenticated
  with check (ambm_is_admin() or (submitter_id = auth.uid() and status = 'pending' and ambm_is_approved()));

-- ── 공지·게시글: 작성=작성자 권한(writer/admin), 수정·삭제=본인 글 작성자 또는 관리자
drop policy if exists community_all on public.community_posts;
create policy community_select on public.community_posts for select using (true);
create policy community_insert on public.community_posts for insert to authenticated
  with check (ambm_is_writer() and author_id = auth.uid());
create policy community_update on public.community_posts for update to authenticated
  using (ambm_is_admin() or (ambm_is_writer() and author_id = auth.uid()))
  with check (ambm_is_admin() or (ambm_is_writer() and author_id = auth.uid()));
create policy community_delete on public.community_posts for delete to authenticated
  using (ambm_is_admin() or (ambm_is_writer() and author_id = auth.uid()));

-- ── 대회 일정·대진(밸런스 포함): 쓰기=관리자 (클라 쓰기 경로 전부 관리자 화면)
drop policy if exists tournaments_all on public.tournaments;
create policy tournaments_select on public.tournaments for select using (true);
create policy tournaments_admin_write on public.tournaments for all to authenticated
  using (ambm_is_admin()) with check (ambm_is_admin());

drop policy if exists bracket_all on public.bracket_tournaments;
create policy bracket_select on public.bracket_tournaments for select using (true);
create policy bracket_admin_write on public.bracket_tournaments for all to authenticated
  using (ambm_is_admin()) with check (ambm_is_admin());

-- ── 대회 관심: 본인 행만, 정리(update)=관리자
drop policy if exists tournament_likes_all on public.tournament_likes;
create policy tournament_likes_select on public.tournament_likes for select using (true);
create policy tournament_likes_insert_own on public.tournament_likes for insert to authenticated
  with check (user_id = auth.uid() or ambm_is_admin());
create policy tournament_likes_delete_own on public.tournament_likes for delete to authenticated
  using (user_id = auth.uid() or ambm_is_admin());
create policy tournament_likes_update_admin on public.tournament_likes for update to authenticated
  using (ambm_is_admin()) with check (ambm_is_admin());

-- ── 활동 로그: 기록만 허용, 수정·삭제=관리자
drop policy if exists logs_all on public.logs;
create policy logs_select on public.logs for select using (true);
create policy logs_insert on public.logs for insert to authenticated with check (true);
create policy logs_admin_update on public.logs for update to authenticated
  using (ambm_is_admin()) with check (ambm_is_admin());
create policy logs_admin_delete on public.logs for delete to authenticated
  using (ambm_is_admin());

-- ── 이체·구매 기록: RPC(wallet_transfer·shop_buy, security definer) 전용
drop policy if exists wallet_transfers_insert_own on public.wallet_transfers;
drop policy if exists "본인만 삽입" on public.shop_purchases;
revoke insert, update, delete on public.wallet_transfers from anon, authenticated;
revoke insert, update, delete on public.shop_purchases from anon, authenticated;

commit;
