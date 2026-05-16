-- =============================================================================
-- Borrar solo interacciones y seguimiento CRM (prueba desde cero)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (mismo rol que el resto de scripts).
--
-- QUÉ BORRA / VACÍA:
--   • public.tasks          — tareas CRM v2 (agenda ligada a interacciones)
--   • public.interactions   — interacciones CRM v2
--   • public.activities     — tareas/agenda legacy (si preferís conservarlas,
--                             comentá el DELETE y usá solo el UPDATE de call_id)
--   • public.calls          — llamadas / interacciones legacy
--
-- QUÉ CONSERVA (no toca):
--   empresas, contactos, cotizaciones, ítems de cotización, productos,
--   pedidos de venta, perfiles, auth.users, documentos de empresa, etc.
--
-- ANTES de borrar calls: se rompe el ciclo calls ↔ quotes (si existen columnas).
--
-- ADVERTENCIA: script destructivo. Hacé respaldo o probá en un proyecto dev.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- CRM v2 (interacciones + tareas)
-- ---------------------------------------------------------------------------
delete from public.tasks;
delete from public.interactions;

-- ---------------------------------------------------------------------------
-- Legacy: calls + activities
-- ---------------------------------------------------------------------------
update public.calls set quote_id = null where quote_id is not null;
update public.quotes set call_id = null where call_id is not null;

delete from public.activities;
delete from public.calls;

commit;

-- =============================================================================
-- Verificación (ejecutar aparte; deberían quedar en 0 las cuentas de arriba)
-- =============================================================================
-- select
--   (select count(*) from public.tasks) as tasks,
--   (select count(*) from public.interactions) as interactions,
--   (select count(*) from public.activities) as activities,
--   (select count(*) from public.calls) as calls;

-- select
--   (select count(*) from public.companies) as companies,
--   (select count(*) from public.contacts) as contacts,
--   (select count(*) from public.quotes) as quotes,
--   (select count(*) from public.products) as products;
