-- 시즌 마감 준비 (2026-10-03, 시즌2 → 시즌3)
-- ① 시즌 마감 스냅샷 테이블: close-season API가 환급·삭제 직전에 지갑·포트폴리오를 통째로 박제.
--    RLS 켜고 정책 없음 → 서비스 키(API)만 읽기/쓰기. 롤백 시 이 테이블에서 역산.
create table if not exists season_close_snapshot (
  id          bigserial primary key,
  season      int         not null,          -- 마감되는 시즌 번호
  kind        text        not null,          -- 'stock_wallets' | 'stock_portfolio' | 'wallets'
  user_id     uuid,
  data        jsonb       not null,          -- 원본 행 그대로
  created_at  timestamptz not null default now()
);
create index if not exists season_close_snapshot_season_idx on season_close_snapshot(season, kind);
alter table season_close_snapshot enable row level security;
revoke all on season_close_snapshot from anon, authenticated;

-- ② season_history에 시즌1 구간 고정 기록.
--    (시즌1은 마감 API 없이 넘어가서 기록이 없었고, 클라가 '직전 시즌'만 임시 보정 중이었음
--     → 시즌3이 되면 시즌1이 지난 시즌 목록·분석에서 사라지는 문제 방지)
insert into app_settings(key, value)
values ('season_history', '[{"season":1,"start":"","end":"2026-07-01"}]')
on conflict (key) do nothing;
