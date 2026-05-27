-- Corrección urgente: login bloqueado tras activar RLS en profiles.
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.crm_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.crm_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.crm_my_role() is not null;
$$;

create or replace function public.crm_user_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.crm_my_role(), '') = any (p_roles);
$$;

drop policy if exists profiles_select_active on public.profiles;
create policy profiles_select_active
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.crm_my_role() in ('super_admin', 'kam', 'reader')
  );

-- Si aún falla: verificar que exista fila en profiles para tu usuario Auth.
-- select u.id, u.email, p.*
-- from auth.users u
-- left join public.profiles p on p.id = u.id
-- order by u.created_at desc;
