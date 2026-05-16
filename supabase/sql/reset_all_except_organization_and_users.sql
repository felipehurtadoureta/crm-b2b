-- =============================================================================
-- Borrar todo el negocio; conservar organización (crm_app_settings) y usuarios
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor.
--
-- CONSERVA:
--   • public.profiles (todos los usuarios / roles)
--   • public.crm_app_settings (fila id=1: nombre producto, emisor, logo_url, etc.)
--   • auth.users — no se borra desde SQL; seguís entrando con las mismas cuentas
--
-- BORRA (entre otras):
--   • Empresas, contactos, KAMs por empresa, cotizaciones, ítems, llamadas,
--     actividades, documentos (metadatos), negocios (deals), OV de venta,
--     interacciones v2 y tareas CRM v2, catálogo productos e inventario
--
-- STORAGE:
--   No elimina archivos del bucket; borrá carpetas/archivos en Storage si hace falta
--   (mismo tema que reset_dev_data.sql).
--
-- ADVERTENCIA: destructivo. Respaldo antes si corresponde.
-- =============================================================================

begin;

delete from public.company_documents;

delete from public.sales_order_items;
delete from public.sales_orders;

delete from public.quote_items;

update public.calls set quote_id = null where quote_id is not null;
update public.quotes set call_id = null where call_id is not null;

delete from public.activities;

delete from public.quotes;

delete from public.calls;

-- CRM v2 (si las tablas existen en el proyecto)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks') then
    delete from public.tasks;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'interactions') then
    delete from public.interactions;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'deals'
  ) then
    delete from public.deals;
  end if;
end $$;

delete from public.company_kams;

delete from public.contacts;

delete from public.companies;

delete from public.inventory_items;
delete from public.product_price_history;
delete from public.products;

commit;

-- Verificación (ejecutar aparte)
-- select
--   (select count(*) from public.companies) as companies,
--   (select count(*) from public.contacts) as contacts,
--   (select count(*) from public.quotes) as quotes,
--   (select count(*) from public.profiles) as profiles,
--   (select count(*) from public.crm_app_settings) as org_settings;
