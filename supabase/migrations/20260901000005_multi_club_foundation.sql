-- Multi-club foundation. The existing Sovereign Animals data remains the default club.
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.clubs (slug, name)
select 'sovereign-animals', name from public.club_settings where id = true
on conflict (slug) do nothing;

create or replace function public.default_club_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.clubs where slug = 'sovereign-animals'
$$;

alter table public.club_settings add column club_id uuid references public.clubs(id);
alter table public.players add column club_id uuid references public.clubs(id);
alter table public.grounds add column club_id uuid references public.clubs(id);
alter table public.games add column club_id uuid references public.clubs(id);
alter table public.registrations add column club_id uuid references public.clubs(id);
alter table public.profiles add column club_id uuid references public.clubs(id);
alter table public.player_access_roles add column club_id uuid references public.clubs(id);

update public.club_settings set club_id = public.default_club_id() where club_id is null;
update public.players set club_id = public.default_club_id() where club_id is null;
update public.grounds set club_id = public.default_club_id() where club_id is null;
update public.games set club_id = public.default_club_id() where club_id is null;
update public.registrations set club_id = public.default_club_id() where club_id is null;
update public.profiles set club_id = public.default_club_id() where club_id is null;
update public.player_access_roles set club_id = public.default_club_id() where club_id is null;

alter table public.club_settings alter column club_id set not null;
alter table public.players alter column club_id set not null, alter column club_id set default public.default_club_id();
alter table public.grounds alter column club_id set not null, alter column club_id set default public.default_club_id();
alter table public.games alter column club_id set not null, alter column club_id set default public.default_club_id();
alter table public.registrations alter column club_id set not null, alter column club_id set default public.default_club_id();
alter table public.profiles alter column club_id set not null, alter column club_id set default public.default_club_id();
alter table public.player_access_roles alter column club_id set not null, alter column club_id set default public.default_club_id();

-- Settings are now one row per club; `id = true` stays on the legacy/current row for the present app.
alter table public.club_settings drop constraint club_settings_pkey;
alter table public.club_settings drop constraint club_settings_id_check;
alter table public.club_settings alter column id drop default;
alter table public.club_settings add primary key (club_id);

-- Keys that were global are now scoped to a club.
alter table public.registrations drop constraint registrations_game_date_fkey;
alter table public.registrations drop constraint registrations_player_id_fkey;
alter table public.registrations drop constraint registrations_pkey;
alter table public.games drop constraint games_ground_id_fkey;
alter table public.games drop constraint games_pkey;
alter table public.grounds drop constraint grounds_name_key;

alter table public.players add constraint players_club_id_id_key unique (club_id, id);
alter table public.grounds add constraint grounds_club_id_name_key unique (club_id, name);
alter table public.grounds add constraint grounds_club_id_id_key unique (club_id, id);
alter table public.games add primary key (club_id, game_date);
alter table public.games add constraint games_club_ground_fkey foreign key (club_id, ground_id) references public.grounds (club_id, id);
alter table public.registrations add primary key (club_id, game_date, player_id);
alter table public.registrations add constraint registrations_club_game_fkey foreign key (club_id, game_date) references public.games (club_id, game_date) on delete cascade;
alter table public.registrations add constraint registrations_club_player_fkey foreign key (club_id, player_id) references public.players (club_id, id) on delete cascade;

create table public.club_memberships (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  role public.app_role not null default 'player',
  created_at timestamptz not null default now(),
  primary key (club_id, user_id),
  unique (club_id, player_id)
);

insert into public.club_memberships (club_id, user_id, player_id, role)
select club_id, user_id, player_id, role from public.profiles
on conflict (club_id, user_id) do nothing;

-- New logins inherit the club of their matching player record, or the current/default club.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare linked_player uuid;
declare linked_club uuid;
declare assigned_role public.app_role;
begin
  select id, club_id into linked_player, linked_club from public.players where lower(email) = lower(new.email) limit 1;
  if linked_player is null then
    linked_club := public.default_club_id();
    insert into public.players (name, email, club_id)
    values (coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)), new.email, linked_club)
    returning id into linked_player;
  end if;
  select role into assigned_role from public.player_access_roles where player_id = linked_player;
  insert into public.player_access_roles (player_id, club_id) values (linked_player, linked_club) on conflict (player_id) do nothing;
  if assigned_role is null then
    if lower(new.email) = 'firewight@gmail.com' then assigned_role := 'admin'; else assigned_role := 'player'; end if;
  end if;
  insert into public.profiles (user_id, role, player_id, club_id)
  values (new.id, assigned_role, linked_player, linked_club)
  on conflict (user_id) do nothing;
  insert into public.club_memberships (club_id, user_id, player_id, role)
  values (linked_club, new.id, linked_player, assigned_role)
  on conflict (club_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function public.set_my_availability(p_game_date date, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid := public.current_player_id();
declare cid uuid;
begin
  select club_id into cid from public.profiles where user_id = auth.uid();
  if pid is null or cid is null or public.current_app_role() <> 'player' or p_game_date < current_date then
    raise exception 'Not permitted';
  end if;
  insert into public.registrations (club_id, game_date, player_id, registered, selected, attended, paid, amount)
  values (cid, p_game_date, pid, p_available, false, false, false, null)
  on conflict (club_id, game_date, player_id) do update set registered = excluded.registered;
end;
$$;

create or replace function public.set_player_selected(p_game_date date, p_player_id uuid, p_selected boolean)
returns void language plpgsql security definer set search_path = public as $$
declare selection_count integer;
declare cid uuid;
begin
  select club_id into cid from public.profiles where user_id = auth.uid();
  if cid is null or public.current_app_role() <> 'captain' or p_game_date < current_date then
    raise exception 'Not permitted';
  end if;
  if p_selected then
    select count(*) into selection_count from public.registrations where club_id = cid and game_date = p_game_date and selected;
    if selection_count >= 12 and not exists (select 1 from public.registrations where club_id = cid and game_date = p_game_date and player_id = p_player_id and selected) then
      raise exception 'Only 12 players can be selected';
    end if;
  end if;
  insert into public.registrations (club_id, game_date, player_id, registered, selected, attended, paid, amount)
  values (cid, p_game_date, p_player_id, false, p_selected, false, false, null)
  on conflict (club_id, game_date, player_id) do update set selected = excluded.selected;
end;
$$;

alter table public.clubs enable row level security;
alter table public.club_memberships enable row level security;
create policy "authenticated read clubs" on public.clubs for select to authenticated using (true);
create policy "read own club memberships" on public.club_memberships for select to authenticated using (user_id = auth.uid());
