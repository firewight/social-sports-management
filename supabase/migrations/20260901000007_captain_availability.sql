-- Captains can record availability for any player in their own club for current/future games.
create or replace function public.set_player_availability(p_game_date date, p_player_id uuid, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select club_id into cid from public.profiles where user_id = auth.uid();
  if cid is null or public.current_app_role() <> 'captain' or p_game_date < current_date then
    raise exception 'Not permitted';
  end if;
  if not exists (select 1 from public.players where id = p_player_id and club_id = cid) then
    raise exception 'Player is not in your club';
  end if;
  insert into public.registrations (club_id, game_date, player_id, registered, selected, attended, paid, amount)
  values (cid, p_game_date, p_player_id, p_available, false, false, false, null)
  on conflict (club_id, game_date, player_id) do update set registered = excluded.registered;
end;
$$;

grant execute on function public.set_player_availability(date, uuid, boolean) to authenticated;
