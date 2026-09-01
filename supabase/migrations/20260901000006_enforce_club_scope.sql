-- Enforce club isolation in the database. Client-side filtering is only a convenience;
-- these policies and functions are the security boundary.
create or replace function public.current_club_id()
returns uuid language sql stable security definer set search_path = public as $$
  select club_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.set_member_authority(p_player_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
declare requester_role public.app_role;
declare requester_club uuid;
declare planned_role public.app_role;
declare active_role public.app_role;
begin
  requester_role := public.current_app_role();
  requester_club := public.current_club_id();
  if requester_role not in ('admin', 'manager') or requester_club is null then raise exception 'Not permitted'; end if;
  if not exists (select 1 from public.players where id = p_player_id and club_id = requester_club) then raise exception 'Player is not in your club'; end if;
  select role into planned_role from public.player_access_roles where player_id = p_player_id and club_id = requester_club;
  select role into active_role from public.profiles where player_id = p_player_id and club_id = requester_club;
  if requester_role = 'manager' and (p_role = 'admin' or planned_role = 'admin' or active_role = 'admin') then raise exception 'Managers cannot grant or change Admin access'; end if;
  insert into public.player_access_roles (player_id, club_id, role) values (p_player_id, requester_club, p_role)
  on conflict (player_id) do update set role = excluded.role, club_id = excluded.club_id;
  update public.profiles set role = p_role where player_id = p_player_id and club_id = requester_club;
  update public.club_memberships set role = p_role where player_id = p_player_id and club_id = requester_club;
end;
$$;

do $$
declare policy_record record;
begin
  for policy_record in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('players','games','grounds','registrations','profiles','club_settings','player_access_roles','clubs','club_memberships')
  loop execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename); end loop;
end;
$$;

create policy "club members read players" on public.players for select to authenticated using (club_id = public.current_club_id());
create policy "club managers manage players" on public.players for all to authenticated using (club_id = public.current_club_id() and public.is_manager()) with check (club_id = public.current_club_id() and public.is_manager());
create policy "club members read games" on public.games for select to authenticated using (club_id = public.current_club_id());
create policy "club managers manage games" on public.games for all to authenticated using (club_id = public.current_club_id() and public.is_manager()) with check (club_id = public.current_club_id() and public.is_manager());
create policy "club members read grounds" on public.grounds for select to authenticated using (club_id = public.current_club_id());
create policy "club managers manage grounds" on public.grounds for all to authenticated using (club_id = public.current_club_id() and public.is_manager()) with check (club_id = public.current_club_id() and public.is_manager());
create policy "club members read registrations" on public.registrations for select to authenticated using (club_id = public.current_club_id());
create policy "club managers manage registrations" on public.registrations for all to authenticated using (club_id = public.current_club_id() and public.is_manager()) with check (club_id = public.current_club_id() and public.is_manager());
create policy "read own or club manager profiles" on public.profiles for select to authenticated using (user_id = auth.uid() or (club_id = public.current_club_id() and public.is_manager()));
create policy "club members read club settings" on public.club_settings for select to authenticated using (club_id = public.current_club_id());
create policy "club managers manage club settings" on public.club_settings for all to authenticated using (club_id = public.current_club_id() and public.is_manager()) with check (club_id = public.current_club_id() and public.is_manager());
create policy "club managers read planned roles" on public.player_access_roles for select to authenticated using (club_id = public.current_club_id() and public.is_manager());
create policy "read own club" on public.clubs for select to authenticated using (id = public.current_club_id());
create policy "read own club membership" on public.club_memberships for select to authenticated using (user_id = auth.uid() and club_id = public.current_club_id());

grant execute on function public.current_club_id() to authenticated;
grant execute on function public.set_member_authority(uuid, public.app_role) to authenticated;
