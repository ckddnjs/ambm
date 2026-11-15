-- 2026-11-15 사용자 요청: 이름이 같은 계정은 모두 같은 선수(아이디)로 보이게 — 이요한(10/10)과 같은 방식
-- 두 보조 계정 모두 경기·지갑·주식·인벤토리·글 0건 확인 후 연결. 로그인 계정은 지우지 않음(그대로 로그인 가능).
-- ※ 김성민은 별도 고려(사용자 지시) — 대상 아님
begin;
insert into account_links(login_user_id, player_user_id) values
 ('6af93861-a0fa-4f20-bce2-d8fc0d21d3e1','651d497d-62d9-4aa0-a66a-eace9f3ec502'),  -- 김동규 (10/10 가입) → 김동규 (4/3)
 ('73e9238c-5f83-467b-97b7-b873a3298e80','5479108a-d1ba-46a6-a9b0-177f7b312fe5')   -- 김동기 (10/8 가입) → 김동기 (5/21)
on conflict (login_user_id) do nothing;
update profiles set status='linked' where id in ('6af93861-a0fa-4f20-bce2-d8fc0d21d3e1','73e9238c-5f83-467b-97b7-b873a3298e80');
commit;
-- 되돌리기: delete from account_links where login_user_id in (위 두 id); update profiles set status='approved' where id in (위 두 id);
