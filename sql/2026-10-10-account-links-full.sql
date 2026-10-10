-- 연결된 로그인 계정이 경기뿐 아니라 앱의 모든 개인 데이터를 기준 선수 계정으로 사용하게 한다.
begin;

create or replace function public.ambm_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = public.ambm_my_player_id() and role = 'admin');
$$;
create or replace function public.ambm_is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' from profiles where id = public.ambm_my_player_id()), false);
$$;
create or replace function public.ambm_is_writer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' and role in ('admin','writer') from profiles where id = public.ambm_my_player_id()), false);
$$;

-- 기존 서버 검증 함수가 로그인 UUID 대신 기준 선수 UUID를 사용하도록 한다.
do $$
declare f record; ddl text;
begin
  for f in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.prokind = 'f'
      and l.lanname in ('sql','plpgsql')
      and p.proname in (
        'ambm_wallet_audit','craft_recycle','craft_start','exchange_approve','exchange_reject',
        'grip_exchange','link_guest_matches','shop_buy','shuttle_exchange','stock_buy','stock_sell',
        'wallet_transfer'
      )
  loop
    ddl := replace(f.definition, 'auth.uid()', 'public.ambm_my_player_id()');
    execute ddl;
  end loop;
end $$;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = public.ambm_my_player_id() or public.ambm_is_admin())
  with check (id = public.ambm_my_player_id() or public.ambm_is_admin());

drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert to authenticated
  with check (public.ambm_is_admin() or (
    submitter_id = public.ambm_my_player_id() and status = 'pending' and public.ambm_is_approved()
  ));

drop policy if exists community_insert on public.community_posts;
drop policy if exists community_update on public.community_posts;
drop policy if exists community_delete on public.community_posts;
create policy community_insert on public.community_posts for insert to authenticated
  with check (public.ambm_is_writer() and author_id = public.ambm_my_player_id());
create policy community_update on public.community_posts for update to authenticated
  using (public.ambm_is_admin() or (public.ambm_is_writer() and author_id = public.ambm_my_player_id()))
  with check (public.ambm_is_admin() or (public.ambm_is_writer() and author_id = public.ambm_my_player_id()));
create policy community_delete on public.community_posts for delete to authenticated
  using (public.ambm_is_admin() or (public.ambm_is_writer() and author_id = public.ambm_my_player_id()));

drop policy if exists tournament_likes_insert_own on public.tournament_likes;
drop policy if exists tournament_likes_delete_own on public.tournament_likes;
create policy tournament_likes_insert_own on public.tournament_likes for insert to authenticated
  with check (user_id = public.ambm_my_player_id() or public.ambm_is_admin());
create policy tournament_likes_delete_own on public.tournament_likes for delete to authenticated
  using (user_id = public.ambm_my_player_id() or public.ambm_is_admin());

drop policy if exists "본인만 읽기쓰기" on public.market_inventory;
create policy "본인만 읽기쓰기" on public.market_inventory for all to authenticated
  using (user_id = public.ambm_my_player_id()) with check (user_id = public.ambm_my_player_id());

drop policy if exists "본인만 읽기" on public.shop_purchases;
create policy "본인만 읽기" on public.shop_purchases for select to authenticated
  using (user_id = public.ambm_my_player_id());

drop policy if exists ser_select_own_or_admin on public.shuttle_exchange_requests;
create policy ser_select_own_or_admin on public.shuttle_exchange_requests for select to authenticated
  using (user_id = public.ambm_my_player_id() or public.ambm_is_admin());

drop policy if exists stock_portfolio_insert_own on public.stock_portfolio;
drop policy if exists stock_portfolio_update_own on public.stock_portfolio;
drop policy if exists stock_portfolio_delete_own on public.stock_portfolio;
create policy stock_portfolio_insert_own on public.stock_portfolio for insert to authenticated
  with check (user_id = public.ambm_my_player_id());
create policy stock_portfolio_update_own on public.stock_portfolio for update to authenticated
  using (user_id = public.ambm_my_player_id());
create policy stock_portfolio_delete_own on public.stock_portfolio for delete to authenticated
  using (user_id = public.ambm_my_player_id());

drop policy if exists stock_trades_insert_own on public.stock_trades;
create policy stock_trades_insert_own on public.stock_trades for insert to authenticated
  with check (user_id = public.ambm_my_player_id());

drop policy if exists wallet_ledger_select_own on public.wallet_ledger;
create policy wallet_ledger_select_own on public.wallet_ledger for select to authenticated
  using (user_id = public.ambm_my_player_id() or public.ambm_is_admin());

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select to authenticated
  using (user_id = public.ambm_my_player_id());

drop policy if exists "admin만 수정" on public.app_settings;
create policy "admin만 수정" on public.app_settings for all to authenticated
  using (public.ambm_is_admin()) with check (public.ambm_is_admin());

drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.ambm_my_player_id()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.ambm_my_player_id()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.ambm_my_player_id()::text);

commit;
