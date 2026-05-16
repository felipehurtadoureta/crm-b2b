-- Configuración global del CRM (marca, datos del emisor, logo).
-- Ejecutar en Supabase SQL Editor. Luego crm_branding_storage.sql para el logo.

create table if not exists public.crm_app_settings (
  id smallint primary key check (id = 1),
  display_name text not null default 'CRM B2B',
  tagline text default 'Panel de gestión',
  legal_name text,
  rut text,
  address text,
  phone text,
  email text,
  website text,
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.crm_app_settings (id, display_name, tagline)
values (1, 'CRM B2B', 'Panel de gestión')
on conflict (id) do nothing;

alter table public.crm_app_settings enable row level security;

drop policy if exists "crm_app_settings_select_auth" on public.crm_app_settings;
create policy "crm_app_settings_select_auth"
  on public.crm_app_settings for select
  to authenticated
  using (true);

drop policy if exists "crm_app_settings_update_super" on public.crm_app_settings;
create policy "crm_app_settings_update_super"
  on public.crm_app_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists "crm_app_settings_insert_super" on public.crm_app_settings;
create policy "crm_app_settings_insert_super"
  on public.crm_app_settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );
