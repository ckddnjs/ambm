-- MCP 점수지 일괄 등록의 원본 순서를 명시적으로 보존한다.
alter table public.matches
  add column if not exists import_batch_id uuid,
  add column if not exists sequence_no integer,
  add column if not exists round_no integer,
  add column if not exists court_no integer;

alter table public.matches
  drop constraint if exists matches_sequence_no_positive,
  add constraint matches_sequence_no_positive check (sequence_no is null or sequence_no >= 1),
  drop constraint if exists matches_round_no_positive,
  add constraint matches_round_no_positive check (round_no is null or round_no >= 1),
  drop constraint if exists matches_court_no_positive,
  add constraint matches_court_no_positive check (court_no is null or court_no >= 1);

create unique index if not exists matches_import_batch_sequence_uidx
  on public.matches(import_batch_id, sequence_no)
  where import_batch_id is not null and sequence_no is not null;
create index if not exists matches_import_batch_idx on public.matches(import_batch_id);

comment on column public.matches.import_batch_id is '점수지 한 묶음의 UUID';
comment on column public.matches.sequence_no is '점수지 안의 전체 경기 순서';
comment on column public.matches.round_no is '점수지 라운드 번호';
comment on column public.matches.court_no is '점수지 코트 번호';
