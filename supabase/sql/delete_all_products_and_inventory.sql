-- =============================================================================
-- Borrado de catálogo: productos + inventario (items) + historial de precios
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (o psql con permisos suficientes).
--
-- ACCIÓN: elimina TODAS las filas de:
--   - public.inventory_items  (seriales / unidades físicas)
--   - public.product_price_history
--   - public.products
--
-- Cotizaciones / pedidos: antes de borrar productos, esta libera la FK poniendo
-- product_id en NULL en líneas que lo tengan (el nombre del ítem queda en la fila).
--
-- NO elimina cotizaciones ni empresas.
--
-- IMPORTANTE: revisá dependencias en tu base (otras tablas con product_id).
-- Si aparece error de FK al ejecutar, añadí un UPDATE/DELETE similar para esa tabla.
--
-- Respaldo antes de usar en producción.
-- =============================================================================

begin;

-- Tabla v2 (si existe): debe borrarse antes de inventory_items (FK restrict).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'quote_item_serial_assignments'
  ) then
    execute 'delete from public.quote_item_serial_assignments';
  end if;
end $$;

-- Opcional: líneas de cotización que apuntan al catálogo (conserva product_name en la fila).
update public.quote_items
set product_id = null
where product_id is not null;

-- Opcional: algunos esquemas tienen pedidos con product_id.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales_order_items'
      and column_name = 'product_id'
  ) then
    execute 'update public.sales_order_items set product_id = null where product_id is not null';
  end if;
end $$;

delete from public.inventory_items;
delete from public.product_price_history;
delete from public.products;

commit;

-- Verificación (ejecutar aparte; debería dar 0):
-- select
--   (select count(*) from public.inventory_items) as inventory_items,
--   (select count(*) from public.product_price_history) as price_history,
--   (select count(*) from public.products) as products;
