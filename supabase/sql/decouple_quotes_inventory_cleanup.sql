-- Limpieza one-shot: desacoplar cotizaciones del inventario serializado.
-- Ejecutar en Supabase SQL Editor después del deploy del frontend.
--
-- 1) Elimina asignaciones cotización ↔ serie
-- 2) Libera unidades que quedaron en `reservado`

begin;

delete from public.quote_item_serial_assignments;

update public.inventory_items
set status = 'disponible'
where status = 'reservado';

commit;

-- Verificación opcional:
-- select status, count(*) from public.inventory_items group by status;
-- select count(*) from public.quote_item_serial_assignments;
