-- =============================================================================
-- Rellenar public.profiles para usuarios que YA existen en auth.users
-- y todavía no tienen fila en profiles (p. ej. invitación aceptada antes de
-- crear el trigger on_auth_user_created).
-- =============================================================================
-- Ejecutar una vez en Supabase → SQL Editor (después de tener la tabla profiles).
-- No borra filas existentes: solo inserta las que faltan.
-- =============================================================================

insert into public.profiles (id, email, full_name, role, phone, is_active)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'Usuario'
  ) as full_name,
  case
    when coalesce(nullif(trim(u.raw_user_meta_data->>'role'), ''), 'reader') in ('super_admin', 'kam', 'reader')
    then coalesce(nullif(trim(u.raw_user_meta_data->>'role'), ''), 'reader')
    else 'reader'
  end as role,
  nullif(trim(u.raw_user_meta_data->>'phone'), '') as phone,
  true as is_active
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      phone = excluded.phone,
      is_active = true,
      updated_at = now();

-- Verificación opcional (descomentá y ejecutá aparte):
-- select u.id, u.email, p.id as profile_id
-- from auth.users u
-- left join public.profiles p on p.id = u.id
-- where p.id is null;
