-- Apply in the Supabase SQL editor before deploying the client update.
-- This makes permissions database-enforced; the browser is never trusted to grant access.

create type public.app_role as enum ('admin', 'manager', 'captain', 'player');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'player',
  player_id uuid unique references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.club_settings (
  id boolean primary key default true check (id),
  name text not null default 'Sovereign Animals',
  description text not null default 'A casual Cricket Club, we hit some balls and then drink some beers!',
  game_fee numeric(10,2) not null default 10,
  bsb text not null default '064434',
  account_number text not null default '10356141',
  updated_at timestamptz not null default now()
);

insert into public.club_settings (id) values (true) on conflict (id) do nothing;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.current_player_id()
returns uuid language sql stable security definer set search_path = public as $$
  select player_id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'manager'), false)
$$;

create or replace function public.is_captain()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'manager', 'captain'), false)
$$;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare linked_player uuid;
begin
  select id into linked_player from public.players where lower(email) = lower(new.email) limit 1;
  if linked_player is null then
    insert into public.players (name, email)
    values (coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), new.email)
    returning id into linked_player;
  end if;
  insert into public.profiles (user_id, role, player_id)
  values (new.id, case when lower(new.email) = 'firewight@gmail.com' then 'admin'::public.app_role else 'player'::public.app_role end, linked_player)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

insert into public.profiles (user_id, role, player_id)
select u.id,
  case when lower(u.email) = 'firewight@gmail.com' then 'admin'::public.app_role else 'player'::public.app_role end,
  (select p.id from public.players p where lower(p.email) = lower(u.email) limit 1)
from auth.users u
on conflict (user_id) do nothing;

-- Purpose-built writes prevent Players/Captains from changing unrelated fields.
create or replace function public.set_my_availability(p_game_date date, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid := public.current_player_id();
begin
  if pid is null or public.current_app_role() <> 'player' or p_game_date < current_date then
    raise exception 'Not permitted';
  end if;
  insert into public.registrations (game_date, player_id, registered, selected, attended, paid, amount)
  values (p_game_date, pid, p_available, false, false, false, null)
  on conflict (game_date, player_id) do update set registered = excluded.registered;
end;
$$;

create or replace function public.set_player_selected(p_game_date date, p_player_id uuid, p_selected boolean)
returns void language plpgsql security definer set search_path = public as $$
declare selection_count integer;
begin
  if public.current_app_role() <> 'captain' or p_game_date < current_date then
    raise exception 'Not permitted';
  end if;
  if p_selected then
    select count(*) into selection_count from public.registrations where game_date = p_game_date and selected;
    if selection_count >= 12 and not exists (select 1 from public.registrations where game_date = p_game_date and player_id = p_player_id and selected) then
      raise exception 'Only 12 players can be selected';
    end if;
  end if;
  insert into public.registrations (game_date, player_id, registered, selected, attended, paid, amount)
  values (p_game_date, p_player_id, false, p_selected, false, false, null)
  on conflict (game_date, player_id) do update set selected = excluded.selected;
end;
$$;

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.grounds enable row level security;
alter table public.registrations enable row level security;
alter table public.profiles enable row level security;
alter table public.club_settings enable row level security;

-- Replace the former public policies completely, rather than layering new policies over them.
do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('players', 'games', 'grounds', 'registrations', 'profiles', 'club_settings')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end;
$$;

create policy "authenticated read players" on public.players for select to authenticated using (true);
create policy "managers manage players" on public.players for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "authenticated read games" on public.games for select to authenticated using (true);
create policy "managers manage games" on public.games for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "authenticated read grounds" on public.grounds for select to authenticated using (true);
create policy "managers manage grounds" on public.grounds for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "authenticated read registrations" on public.registrations for select to authenticated using (true);
create policy "managers manage registrations" on public.registrations for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "read own profile or all profiles for admins" on public.profiles for select to authenticated using (user_id = auth.uid() or public.current_app_role() = 'admin');
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "authenticated read club settings" on public.club_settings for select to authenticated using (true);
create policy "managers manage club settings" on public.club_settings for all to authenticated using (public.is_manager()) with check (public.is_manager());

grant execute on function public.set_my_availability(date, boolean) to authenticated;
grant execute on function public.set_player_selected(date, uuid, boolean) to authenticated;
