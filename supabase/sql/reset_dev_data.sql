-- =============================================================================
-- REINICIO DE DATOS DE NEGOCIO (desarrollo / prueba de flujo)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor.
--
-- QUÉ BORRA (solo tablas en public.*):
--   Metadatos de documentos (company_documents), empresas, contactos, cotizaciones,
--   registros de contacto (calls), tareas (activities), productos/inventario (opcional), etc.
--   Los archivos del bucket "company-documents" NO se borran desde SQL (ver STORAGE arriba).
--
-- QUÉ NO TOCA:
--   - Cuentas en Authentication (auth.users)
--   - Filas en public.profiles (sigues pudiendo entrar con los mismos usuarios)
--
-- ANTES: respaldo si hace falta. Si alguna otra tabla no existe, comenta esa línea.
--
-- STORAGE (obligatorio leer):
--   Supabase no permite DELETE directo en storage.objects (trigger protect_delete).
--   Vacía el bucket antes o después de este script:
--     • Dashboard → Storage → bucket "company-documents" → borrar archivos/carpetas, o
--     • Storage API (service role): removeObjects / emptyBucket desde un script o Edge Function.
--   Si solo corrés este SQL, los archivos pueden quedar huérfanos en Storage hasta que los borres ahí.
-- =============================================================================

begin;

delete from public.company_documents;

delete from public.sales_order_items;
delete from public.sales_orders;

delete from public.quote_items;

-- Romper ciclo posible calls ↔ quotes (ambas pueden referenciarse)
update public.calls set quote_id = null where quote_id is not null;
update public.quotes set call_id = null where call_id is not null;

delete from public.activities;

delete from public.quotes;

delete from public.calls;

-- deals es opcional: en algunos proyectos la tabla no existe
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'deals'
  ) then
    delete from public.deals;
  end if;
end $$;

delete from public.company_kams;

delete from public.contacts;

delete from public.companies;

-- Catálogo e inventario (comenta si quieres conservar productos)
delete from public.inventory_items;
delete from public.product_price_history;
delete from public.products;

commit;

-- Verificación (descomenta y ejecuta aparte; todos deberían ser 0)
-- select
--   (select count(*) from public.companies) as companies,
--   (select count(*) from public.contacts) as contacts,
--   (select count(*) from public.quotes) as quotes,
--   (select count(*) from public.calls) as calls,
--   (select count(*) from public.activities) as activities,
--   (select count(*) from public.company_documents) as documents;

-- =============================================================================
-- Usuarios
-- =============================================================================
-- Para “borrar todo” incluido login: usa el panel Authentication → Users
-- en Supabase. No mezcles borrado masivo de auth.users con este script sin
-- documentarte, o puedes quedar sin acceso al proyecto.
