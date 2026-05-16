-- Permitir que super_admin actualice el rol de otros perfiles (ajustar a tu política real).
-- Ejecutar después de revisar la tabla public.profiles.

create policy "profiles_update_by_super_admin"
  on public.profiles for update
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

-- Si ya existe una política UPDATE conflictiva, eliminála o combiná condiciones en una sola.
