-- =============================================================================
-- Sincronizar public.profiles cuando se crea un usuario en auth.users
-- (invitación por correo, alta manual en Authentication, etc.)
-- =============================================================================
-- Requisitos típicos en public.profiles:
--   - primary key (id) = auth.users.id
--   - columnas: email, full_name, role, phone (nullable), is_active, updated_at
-- Si tu tabla usa otro nombre de tipo para role, ajustá el cast o dejá role como text.
--
-- Ejecutar en Supabase → SQL Editor (una sola vez por proyecto).
--
-- Si ya había usuarios en Auth antes de ejecutar esto, el trigger no los tocó:
-- ejecutá también (una vez) supabase/sql/profiles_backfill_from_auth.sql
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'reader');
  fn text;
begin
  if r not in ('super_admin', 'kam', 'reader') then
    r := 'reader';
  end if;

  fn := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Usuario'
  );

  insert into public.profiles (id, email, full_name, role, phone, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    fn,
    r,
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        phone = excluded.phone,
        is_active = true,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
