-- 인증 계정은 그대로 유지하면서, 보조 계정이 기준 선수의 경기 기록을 보게 한다.
begin;

create table if not exists public.account_links (
  login_user_id uuid primary key references auth.users(id) on delete cascade,
  player_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (login_user_id <> player_user_id)
);

alter table public.account_links enable row level security;
revoke all on public.account_links from public, anon, authenticated;

create or replace function public.ambm_my_player_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select l.player_user_id from public.account_links l where l.login_user_id = auth.uid()),
    auth.uid()
  );
$$;
revoke all on function public.ambm_my_player_id() from public, anon;
grant execute on function public.ambm_my_player_id() to authenticated;

commit;
