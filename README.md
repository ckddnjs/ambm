# 🏸 새벽민턴 AM BADMINTON

배드민턴 클럽 전용 PWA — 경기 기록, 통계 랭킹, 대회 운영, 밸런스 배분, 커뮤니티를 통합 제공합니다.

**프로덕션 URL:** https://ambm.vercel.app

---

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| **UI** | Vanilla HTML + JavaScript (프레임워크 없음) |
| **스타일** | `app.css` — CSS 변수 기반 다크/라이트 테마 |
| **백엔드 / DB / 인증** | [Supabase](https://supabase.com) (클라이언트 SDK v2, CDN 로드) |
| **서버리스 API** | Vercel Serverless Functions (`/api/` 폴더) |
| **폰트** | Google Fonts — Noto Sans KR, Black Han Sans |
| **날씨 위젯** | [Open-Meteo](https://open-meteo.com) (API 키 불필요) |
| **호스팅** | [Vercel](https://vercel.com) — 크론 잡 + 캐시 헤더 설정 포함 |
| **PWA** | `manifest.json` + `sw.js` (오프라인 캐시 전략) |

---

## 파일 구조

```
ambm-main/
├── index.html          # SPA 셸 — 로그인, 전체 페이지/모달 HTML 포함
├── core.js             # Supabase 클라이언트, 인증, 라우팅, CI 계산
├── app.css             # 전역 테마, 컴포넌트 스타일
├── dashboard.js        # 대시보드 — 통계, 랭킹, 산점도
├── feed.js             # 경기 기록 피드 — 검색(초성), 무한스크롤
├── register.js         # 경기 등록 — 칩 선택 UI, 비회원 지원
├── admin.js            # 관리자 — 승인/삭제/회원관리/대회 일괄등록
├── balance.js          # 밸런스 배분 — CI 기반 팀 균형 편성
├── tournament.js       # 자체대회 — 리그/토너먼트 대진표
├── community.js        # 커뮤니티 게시판 CRUD
├── settings.js         # 설정 — 이름 변경, 아바타 업로드
├── utils.js            # 공통 유틸 — 모달, 토스트, 비교 예측
├── logo.js             # ⚠️ 대형 SVG 벡터 파일 — AI가 읽지 말 것 (토큰 낭비)
├── sw.js               # Service Worker (캐시 버전: ambm-v5)
├── manifest.json       # PWA 메타데이터
├── package.json        # 패키지 정보 (supabase-js 의존성)
├── vercel.json         # 크론 + 캐시 헤더 설정
├── api/
│   ├── keep-alive      # 크론 핑 — Supabase 웜업 유지
│   └── admin/          # 서버리스 API (signup, create-user, delete-user)
└── apple-touch-icon.png / icon-192.png / icon-512.png
```

> **`logo.js`는 SVG 벡터 데이터 파일입니다. AI 코드 분석 시 절대 읽지 마세요. 내용이 없으며 토큰만 낭비됩니다.**

---

## 주요 기능

### 인증
- **카카오 OAuth** + **이메일/비밀번호** 로그인
- 회원가입 후 **관리자 승인** 대기 (미승인 시 대기 화면)
- 역할: `일반` / `작성자` / `관리자`

### 대시보드 (`dashboard.js`)
- 개인 CI 종합점수, 승률, 최근 연승/연패 표시
- CI 변동 추이 차트 (CI / 승률 / 득실 탭)
- 베스트 파트너, 이번 시즌 MVP 포디움
- 전체 랭킹 테이블 + 승률-득실 산점도

### 경기 기록 피드 (`feed.js`)
- 승인된 경기 최대 2000건 로드 (날짜별 그룹)
- 이름 검색 + **초성 검색** (예: `ㅇㅇㅂ` → `이영배`)
- 내 경기 필터, 날짜별 요약 오버레이
- 카드 하단 메모 표시 (`note` / `admin_note`)

### 경기 등록 (`register.js`)
- 칩 기반 선수 선택 UI (A팀 🔴 / B팀 🔵)
- 초성 필터 (현재 회원 기준 자동 생성)
- 비회원 게스트 등록 — 폼 제출 전까지 풀(pool) 유지
- 점수 프리셋 버튼 (21/25점), 메모 입력
- 제출 시 `status: 'pending'`으로 insert → 관리자 승인 필요

### 관리자 (`admin.js`)
- 대기 중 회원 / 경기 승인·거절
- 회원 정보 수정, 게스트 연결, 통계 제외 설정
- 경기 일괄 등록 (탭 구분 텍스트 파싱)
- 경기 필터 삭제, 로그 조회

### 밸런스 배분 (`balance.js`)
- 참석자 CI 기반 팀 균형 자동 계산
- 개인전 / 듀오전 / 팀장전 모드
- 결과 저장 → `bracket_tournaments` (`status: 'balance'`)

### 자체대회 (`tournament.js`)
- 조별리그 + 본선 토너먼트 대진표
- 실시간 점수 입력 및 저장
- 대회 삭제 시 연관 경기도 정리

### 커뮤니티 (`community.js`)
- 카테고리별 게시판 (일반 / 정보 / 규칙)
- 관리자/작성자 글쓰기, 본인 글 수정·삭제

### 설정 (`settings.js`)
- 이름 변경, 아바타 이미지 업로드 (Supabase Storage)
- 테마 전환 (다크/라이트), 글자 크기 조절

---

## Supabase 데이터베이스 구조

| 테이블 / 오브젝트 | 용도 |
|-----------------|------|
| `profiles` | 회원 정보 (id, name, role, status, gender, exclude_stats, avatar_url 등) |
| `matches` | 경기 기록 (팀 구성, 점수, status, note, admin_note, submitter 등) |
| `logs` | 감사 로그 (액션, user_id) |
| `bracket_tournaments` | 대회 및 밸런스 결과 (status로 구분, groups/rounds JSON) |
| `community_posts` | 커뮤니티 게시글 |
| `tournament_likes` | 대회 좋아요 (회원 탈퇴 시 정리됨) |
| **Storage `avatars`** | 아바타 파일 (`{userId}/avatar.jpg`) |
| **RPC `update_avatar_url`** | 아바타 URL 업데이트 (직접 update 실패 시 폴백) |

---

## 환경 변수

### 클라이언트 (`core.js`에 하드코딩)
```js
SUPABASE_URL  = 'https://wkclmrbdsinvliaaqjol.supabase.co'
SUPABASE_ANON = '...'   // anon 공개 키 (RLS로 보호)
APP_URL       = 'https://ambm.vercel.app'
```

### Vercel 서버리스 (`api/` 폴더)
| 변수 | 용도 |
|------|------|
| `CRON_SECRET` | `/api/keep-alive` 크론 보호 (Bearer 인증) |
| `SUPABASE_SERVICE_KEY` | 관리자 API (`/api/admin/*`) — 서비스 롤 키 |

---

## 배포

```bash
# 의존성 없음 (CDN 사용) — 별도 빌드 스텝 불필요
# Vercel에 폴더 그대로 배포
```

- Vercel 크론: `0 9 */6 * *` 마다 `/api/keep-alive` 호출 → Supabase 연결 유지
- HTML/JS/CSS/SW 전부 `Cache-Control: no-cache` → PWA 업데이트 즉시 반영
- 서비스 워커 캐시 버전: `ambm-v5` (`sw.js`)

---

## CI (Composite Index) 계산

`core.js`의 `calcCI(wins, games, diff)` 함수가 종합점수를 산출합니다.

```
BASE_RATING       = 1000
CONFIDENCE_DENOM  = 10    (경기 수 기반 신뢰도)
PD_WEIGHT         = 5     (득실 가중치)
WR_WEIGHT         = 200   (승률 가중치)
SYNERGY_WEIGHT    = 100   (파트너 시너지)
SYNERGY_CAP       = 50
H2H_WEIGHT        = 80    (상대 전적)
RECENT_WEIGHT     = 60    (최근 경기 보정)
ELO_DIVISOR       = 400
```

등급: `S+` → `S` → `A+` → `A` → `B+` → `B` → `C` → `D` (`ciToLabel`)

---

## 라우팅 (해시 기반 SPA)

`navigateTo(page)` → `pushState({page}, '#page')` → `popstate` 핸들러

| 해시 | 페이지 | 권한 |
|------|--------|------|
| `#dashboard` | 대시보드 | 전체 |
| `#feed` | 경기 기록 | 전체 |
| `#register` | 경기 등록 | 전체 |
| `#community` | 커뮤니티 | 전체 |
| `#balance` | 밸런스 배분 | 전체 (저장은 관리자) |
| `#tournament` | 자체대회 | 전체 |
| `#compare` | 비교/예측 | 전체 |
| `#settings` | 설정 | 전체 |
| `#admin` | 관리자 패널 | `role === 'admin'` |
| `#install-guide` | 앱 설치 가이드 | 전체 (오버레이) |
