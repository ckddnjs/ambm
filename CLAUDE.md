# CLAUDE.md — 새벽민턴(ambm) 작업 규칙

전체 기능·스키마는 `README.md` 참고. 이 문서는 **작업 시 반드시 지킬 규칙과 함정**만 담는다.
⚠️ 이 레포는 hsdTV(후생동TV)와 **다른 프로젝트·다른 깃허브 계정**이다. 절대 섞지 말 것.

## 깃 · 배포 (가장 중요)

- **커밋 author는 반드시 `ckddnjs <ckddnjskorea@gmail.com>`** (레포 로컬 설정됨). hsdTV의 `ckddnjskore@gmail.com`와 다르다 — 혼동 금지.
- 원격: `github.com/ckddnjs/ambm`. 자격증명은 Windows 자격 증명 관리자에 경로 키 `github.com/ckddnjs/ambm`로 저장(`credential.useHttpPath=true`). 경로 키가 안 맞으면 푸시가 프롬프트 대기로 멈춘다.
- 커밋 메시지 하단에 항상 붙인다:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- **작업 전 `git fetch` + behind 확인 필수** — 사용자가 깃허브 웹 업로드("Add files via upload")로 커밋하는 경우가 있다.
- **배포 반영 = `sw.js`의 `CACHE='ambm-vNN'` 버전 범프 + `index.html`의 해당 `?v=` 범프 필수.** 안 하면 사용자 기기에 구버전이 캐시로 남는다.

## 코드 구조 (바닐라 JS, 빌드 없음)

- 기능별 루트 `.js` 파일 1개씩, 전역 스코프 공유 (hsdTV와 유사 패턴).
- 서버리스 API는 `api/` (Vercel, ESM, `SUPABASE_SERVICE_KEY` 환경변수).
- 로컬 미리보기: `PORT=5174 node dev-preview.mjs` (`/api`는 프로덕션 프록시). UI 변경은 Playwright(뷰포트 390×844, deviceScaleFactor 2)로 스크린샷 검증.

## 백엔드 (Supabase)

- 프로젝트 ref `wkclmrbdsinvliaaqjol` — **MCP는 `supabase-ambm`** 사용 (`supabase` MCP는 hsdTV용이다!).
- 실행한 SQL은 `sql/` 폴더에 파일로도 남긴다.
- **민감 로직은 전부 서버검증 RPC — 클라이언트 폴백 금지** (2026-07 전면 적용):
  - 주식 `stock_buy`/`stock_sell` (주가 = `ambm_stock_price`, CI−900 서버 계산), 거래정지 `ambm_trading_halted`
  - 지갑 `wallet_transfer` / 제작소 `shop_buy`·`craft_start`(성공판정 서버난수)·`craft_recycle`·`shuttle_exchange`(아이템가 `ambm_item_price`)
  - 경기 게스트연결 `link_guest_matches`, 관리자판정 `ambm_is_admin`
  - `stock_portfolio`·`stock_trades`·`market_inventory`는 직접 INSERT/UPDATE/DELETE가 revoke됨 — 반드시 RPC 경유. 새 기능도 이 원칙을 따른다.
- **matches RLS**: 등록은 본인(submitter_id) + status=pending만, 승인/수정/삭제는 admin만. 교환요청은 `shuttle_exchange_requests`(+`exchange_approve/reject` RPC).

## 도메인 규칙

- 랭킹 기본 정렬 = **CI** (`calcCI`: 1000 + 승률·신뢰도 200 + 평균득실×5 + 경기수 보너스 + 접전승).
- 시즌 = `app_settings`의 `season_start`·`current_season`, 클라 `inSeason()` 필터.
- 테스트 계정은 별도 관리(레포에 기록하지 않음) — 필요 시 사용자에게 확인.
