alter table public.club_settings add column if not exists logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-assets', 'club-assets', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy "managers upload club logos" on storage.objects for insert to authenticated
with check (bucket_id = 'club-assets' and public.is_manager());
