-- Persist the reserve designation so fee exemptions agree across devices.
begin;
alter table public.registrations add column if not exists is_twelfth_man boolean not null default false;
-- Confirmed by the club owner: Marcus Fowler was the reserve on 17 October.
update public.registrations r set is_twelfth_man = true
from public.players p
where r.player_id = p.id and r.club_id = p.club_id
  and p.id = 'bd6c727d-23fb-4490-9bd3-620ec14de45e'
  and r.club_id = '3f039200-541b-4e29-aaf7-21f1101e14c1'
  and r.game_date = date '2026-10-17' and r.selected;
create unique index if not exists registrations_one_twelfth_man
on public.registrations(club_id, game_date) where is_twelfth_man;
create or replace function public.assign_twelfth_man()
returns trigger language plpgsql security definer set search_path = public as $$
declare other_selected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.club_id::text || ':' || new.game_date::text, 0));
  if not new.selected then
    new.is_twelfth_man := false;
  elsif tg_op = 'INSERT' then
    select count(*) into other_selected from public.registrations
    where club_id = new.club_id and game_date = new.game_date and selected and player_id <> new.player_id;
    new.is_twelfth_man := other_selected = 11;
  elsif not old.selected then
    select count(*) into other_selected from public.registrations
    where club_id = new.club_id and game_date = new.game_date and selected and player_id <> new.player_id;
    new.is_twelfth_man := other_selected = 11;
  else
    new.is_twelfth_man := old.is_twelfth_man;
  end if;
  return new;
end;
$$;
drop trigger if exists registrations_assign_twelfth_man on public.registrations;
create trigger registrations_assign_twelfth_man before insert or update on public.registrations
for each row execute function public.assign_twelfth_man();
commit;
