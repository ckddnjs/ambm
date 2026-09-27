-- 소식 탭 '일반'에 시즌2 상승률 TOP 10 게시글을 남긴다.
-- body가 마커면 community.js의 commPostHTML이 글자 대신 순위 목록을 그린다.
-- 순위 데이터 자체는 community.js의 RISE_TOP10 상수에 있다.
insert into public.community_posts (category, title, body, author_id, author_name, created_at, updated_at)
values ('general', '📈 시즌2 상승률 TOP 10 (20경기↑)', '[[RISE_TOP10]]',
        'cf07e428-7130-4f6d-9646-11a13ab9d113', '관리자', now(), now());
