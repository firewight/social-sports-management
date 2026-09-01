create or replace function public.set_member_authority(p_player_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
declare requester_role public.app_role;
declare planned_role public.app_role;
declare active_role public.app_role;
begin
  requester_role := public.current_app_role();
  if requester_role not in ('admin', 'manager') then
    raise exception 'Not permitted';
  end if;

  select role into planned_role from public.player_access_roles where player_id = p_player_id;
  select role into active_role from public.profiles where player_id = p_player_id;
  if requester_role = 'manager' and (p_role = 'admin' or planned_role = 'admin' or active_role = 'admin') then
    raise exception 'Managers cannot grant or change Admin access';
  end if;

  insert into public.player_access_roles (player_id, role)
  values (p_player_id, p_role)
  on conflict (player_id) do update set role = excluded.role;

  update public.profiles set role = p_role where player_id = p_player_id;
end;
$$;

grant execute on function public.set_member_authority(uuid, public.app_role) to authenticated;
