-- 11/15 일요일 시상 게시 (밴드 글 기반, 순위는 앱 경기 기록 기준으로 보정 — 사용자 결정)
-- 밴드 원문은 김선구 중복·김종호 누락이 있어 앱 순위(승→득실→패)로 맞춤. 콕 개수는 비워 둠(관리자가 ✏️로 입력).
-- author_id null / author_name '관리자' — 관리자는 RLS(ambm_is_admin)로 수정·삭제 가능
insert into community_posts(category,title,body,author_id,author_name)
values('award','11월 15일(일) 시상',
'{"v":2,"date":"2026-11-15","awards":[{"group":"경기력상","prize":"1등","name":"김동규","cock":0},{"group":"경기력상","prize":"2등","name":"조항윤","cock":0},{"group":"경기력상","prize":"3등","name":"김종호","cock":0},{"group":"경기력상","prize":"4등","name":"김선구","cock":0},{"group":"경기력상","prize":"4등","name":"정미리","cock":0},{"group":"경기력상","prize":"6등","name":"강창원","cock":0},{"group":"평화상","prize":"11등","name":"권오승","cock":0},{"group":"평화상","prize":"13등","name":"안치영","cock":0},{"group":"힘내요상","prize":"20등","name":"심재성","cock":0},{"group":"힘내요상","prize":"20등","name":"류현준","cock":0},{"group":"힘내요상","prize":"22등","name":"이영배","cock":0}]}',
null,'관리자');
