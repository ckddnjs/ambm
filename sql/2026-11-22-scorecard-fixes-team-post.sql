-- 2026-11-22 새벽 점수판(묶음 27be1c4c) 판독 오류 수정 + 팀전 소식 글
-- 1) 강민주(39eebd35)↔한민규(게스트) 뒤바뀜 4경기: 2R3코트 b2, 3R2코트 a1 → 강민주 / 3R4코트 b2, 5R4코트 b2 → 한민규(id null)
--    행 id: 79d50f51, 55591b04, db9432ee, 0b889da4 (pending 상태에서 수정)
-- 2) 1R3코트(240e9e1d) 점수 14:21 → 15:21
update matches set score_a=15 where id='240e9e1d-492f-4dc3-a088-644c2ec8e3ba' and score_a=14 and score_b=21;
-- 3) 소식 팀전 글(category='team', body=JSON 스냅샷) — 팀지훈 14:6 팀성환
-- insert into community_posts(category,title,body,author_id,author_name) ... (id c27c5e5d)
