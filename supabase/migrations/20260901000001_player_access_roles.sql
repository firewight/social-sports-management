-- Stores the role that will be granted when a player registers, without granting Managers role-editing rights.
create table public.player_access_roles (
  player_id uuid primary key references public.players(id) on delete cascade,
  role public.app_role not null default 'player'
);

insert into public.player_access_roles (player_id, role)
select p.id, coalesce(pr.role, 'player'::public.app_role)
from public.players p
left join public.profiles pr on pr.player_id = p.id
on conflict (player_id) do nothing;

alter table public.player_access_roles enable row level security;
create policy "admins manage planned player roles" on public.player_access_roles for all to authenticated
using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare linked_player uuid;
declare assigned_role public.app_role;
begin
  select id into linked_player from public.players where lower(email) = lower(new.email) limit 1;
  if linked_player is null then
    insert into public.players (name, email)
    values (coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), new.email)
    returning id into linked_player;
  end if;
  select role into assigned_role from public.player_access_roles where player_id = linked_player;
  insert into public.player_access_roles (player_id) values (linked_player) on conflict (player_id) do nothing;
  if assigned_role is null then
    if lower(new.email) = 'firewight@gmail.com' then assigned_role := 'admin'; else assigned_role := 'player'; end if;
  end if;
  insert into public.profiles (user_id, role, player_id)
  values (new.id, assigned_role, linked_player)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
