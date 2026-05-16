-- Bucket público para el logo del CRM (URL estable en crm_app_settings.logo_url).
-- Ejecutar después de crm_app_settings.sql.

insert into storage.buckets (id, name, public)
values ('crm-branding', 'crm-branding', true)
on conflict (id) do nothing;

drop policy if exists "crm_branding_select_public" on storage.objects;
create policy "crm_branding_select_public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'crm-branding');

drop policy if exists "crm_branding_insert_super" on storage.objects;
create policy "crm_branding_insert_super"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'crm-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "crm_branding_update_super" on storage.objects;
create policy "crm_branding_update_super"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'crm-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "crm_branding_delete_super" on storage.objects;
create policy "crm_branding_delete_super"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'crm-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );
