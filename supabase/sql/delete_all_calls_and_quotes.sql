-- =============================================================================
-- Borrar TODAS las interacciones (calls) y TODAS las cotizaciones (quotes)
-- =============================================================================
-- Ejecutar solo en Supabase → SQL Editor cuando quieras vaciar esos módulos
-- (p. ej. entorno de prueba). NO toca empresas, contactos, productos ni perfiles.
--
-- TAMBIÉN BORRA (para no violar FKs ni dejar datos incoherentes):
--   - Ítems de cotización (quote_items)
--   - Órdenes de venta ligadas a una cotización (sales_order_items + sales_orders
--     donde quote_id no es null). Las órdenes sin cotización se conservan.
--
-- ACTIVIDADES (activities): solo se desvincula call_id (no se borran tareas enteras).
--
-- ANTES: respaldo o export si lo necesitás.
-- =============================================================================

begin;

-- 1) Órdenes de venta que dependen de una cotización (omitir si no usás ventas)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sales_order_items'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sales_orders'
  ) then
    delete from public.sales_order_items
    where sales_order_id in (
      select id from public.sales_orders where quote_id is not null
    );
    delete from public.sales_orders
    where quote_id is not null;
  end if;
end $$;

-- 2) Líneas de cotización
delete from public.quote_items;

-- 3) Romper referencia cruzada calls ↔ quotes (si existe en tu esquema)
update public.calls set quote_id = null where quote_id is not null;
update public.quotes set call_id = null where call_id is not null;

-- 4) Tareas que apuntaban a una interacción (se conserva la fila en activities)
update public.activities set call_id = null where call_id is not null;

-- 5) Cotizaciones e interacciones
delete from public.quotes;
delete from public.calls;

commit;

-- Verificación (ejecutar aparte; todos deberían dar 0)
-- select
--   (select count(*) from public.quotes) as quotes,
--   (select count(*) from public.quote_items) as quote_items,
--   (select count(*) from public.calls) as calls;
