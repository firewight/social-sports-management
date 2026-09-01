-- Managers may view the Members tab, but only Admins can change authorities.
create policy "managers read profiles" on public.profiles for select to authenticated
using (public.is_manager());

create policy "managers read planned player roles" on public.player_access_roles for select to authenticated
using (public.is_manager());
