-- Abreviatura visible en listados (ej. FHU para "Felipe Hurtado Ureta").
-- Ejecutar en Supabase → SQL Editor.

alter table public.profiles
  add column if not exists display_abbr text;

comment on column public.profiles.display_abbr is
  'Texto corto en tablas (empresas, contactos). Si es null, el CRM muestra iniciales derivadas del nombre.';

-- RPC: cada usuario puede fijar solo su propia abreviatura (sin tocar rol ni email).
create or replace function public.set_my_display_abbr(p_abbr text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    display_abbr = nullif(trim(p_abbr), ''),
    updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.set_my_display_abbr(text) from public;
grant execute on function public.set_my_display_abbr(text) to authenticated;
