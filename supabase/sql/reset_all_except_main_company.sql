-- =============================================================================
-- Borrar casi todo el negocio, conservando usuarios y UNA empresa (principal)
-- =============================================================================
-- Si en cambio querés conservar solo configuración de organización (crm_app_settings)
-- y usuarios, sin ninguna empresa: usá `reset_all_except_organization_and_users.sql`.
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor con rol que pueda borrar en public.
--
-- CONSERVA:
--   • auth.users (no se toca desde aquí) y public.profiles (todos los usuarios)
--   • public.crm_app_settings (config global / marca)
--   • La fila public.companies con id = :main_company_id
--   • Todo lo que cuelga de esa empresa por company_id (contactos, KAMs,
--     cotizaciones, ítems, llamadas, actividades, documentos metadatos,
--     interacciones v2, tareas CRM v2, negocios deals, OV ligadas a esa empresa)
--   • Catálogo global: public.products, public.inventory_items,
--     public.product_price_history (si no descomentás la sección opcional abajo)
--
-- BORRA:
--   • Todas las demás empresas y sus datos dependientes
--
-- ANTES:
--   1) Si hay varias empresas: abrí el bloque DO de abajo y asigná manual_uuid.
--   2) Si hay exactamente UNA empresa, no hace falta tocar nada (se elige sola).
--   3) Respaldo si corresponde.
--   Consulta útil: select id, name, rut from public.companies order by name;
--
-- STORAGE (company-documents):
--   Los archivos en el bucket no se borran con este SQL; podés limpiar a mano
--   en Dashboard → Storage. Las filas en public.company_documents de empresas
--   borradas desaparecen con el DELETE.
--
-- PRODUCTOS (opcional):
--   Si descomentás el bloque final, se vacía catálogo e inventario: solo hacelo
--   si las cotizaciones de la empresa principal no dependen de esos productos
--   (o si aceptás borrar también ítems de cotización en un paso aparte).
-- =============================================================================

begin;

-- Define qué empresa conservar: manual_uuid solo si hay 2+ filas en public.companies
do $$
declare
  manual_uuid uuid := null; -- ej. cuando hay varias: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;
  cnt int;
  chosen uuid;
begin
  drop table if exists _keep;
  create temporary table _keep (main_company_id uuid primary key) on commit drop;

  select count(*)::int into cnt from public.companies;

  if cnt = 0 then
    raise exception 'reset_all_except_main_company: no hay filas en public.companies; nada que conservar.';
  end if;

  if manual_uuid is not null then
    if not exists (select 1 from public.companies c where c.id = manual_uuid) then
      raise exception 'reset_all_except_main_company: manual_uuid % no existe en public.companies. Ejecutá: select id, name from public.companies order by name;', manual_uuid;
    end if;
    chosen := manual_uuid;
  elsif cnt = 1 then
    select c.id into strict chosen from public.companies c limit 1;
  else
    raise exception
      'reset_all_except_main_company: hay % empresas. Abrí este script y asigná manual_uuid en el bloque DO (línea declare) con el id de la empresa a conservar. Luego ejecutá de nuevo todo el script. Consulta: select id, name, rut from public.companies order by name;',
      cnt;
  end if;

  insert into _keep values (chosen);
end $$;

-- Desvincular contacto principal en empresas que se van a borrar (FK cómoda)
update public.companies c
set primary_contact_id = null
where c.id <> (select main_company_id from _keep);

-- Interacciones / tareas CRM v2 (si existen las tablas)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks') then
    execute $d$
      delete from public.tasks t
      where t.company_id <> (select main_company_id from _keep)
    $d$;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'interactions') then
    execute $d$
      delete from public.interactions i
      where i.company_id <> (select main_company_id from _keep)
    $d$;
  end if;
end $$;

delete from public.company_documents
where company_id <> (select main_company_id from _keep);

-- Órdenes de venta de otras empresas
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sales_order_items')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sales_orders') then
    execute $d$
      delete from public.sales_order_items soi
      using public.sales_orders so
      where soi.sales_order_id = so.id
        and so.company_id <> (select main_company_id from _keep)
    $d$;
    execute $d$
      delete from public.sales_orders so
      where so.company_id <> (select main_company_id from _keep)
    $d$;
  end if;
end $$;

-- Cotizaciones de otras empresas
delete from public.quote_items
where quote_id in (
  select q.id from public.quotes q
  where q.company_id <> (select main_company_id from _keep)
);

update public.calls c
set quote_id = null
from public.quotes q
where c.quote_id = q.id
  and q.company_id <> (select main_company_id from _keep);

update public.quotes q
set call_id = null
where q.company_id <> (select main_company_id from _keep)
  and q.call_id is not null;

delete from public.quotes
where company_id <> (select main_company_id from _keep);

delete from public.calls
where company_id <> (select main_company_id from _keep);

delete from public.activities
where company_id <> (select main_company_id from _keep);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'deals') then
    execute $d$
      delete from public.deals d
      where d.company_id <> (select main_company_id from _keep)
    $d$;
  end if;
end $$;

delete from public.company_kams
where company_id <> (select main_company_id from _keep);

delete from public.contacts
where company_id <> (select main_company_id from _keep);

delete from public.companies
where id <> (select main_company_id from _keep);

commit;

-- =============================================================================
-- Opcional: vaciar catálogo e inventario (descomentar solo si lo necesitás)
-- =============================================================================
-- begin;
-- delete from public.inventory_items;
-- delete from public.product_price_history;
-- delete from public.products;
-- commit;

-- =============================================================================
-- Verificación (ejecutar aparte)
-- =============================================================================
-- select (select count(*) from public.companies) as companies;  -- esperable: 1
-- select (select count(*) from public.contacts) as contacts;
-- select (select count(*) from public.quotes) as quotes;
-- select (select count(*) from public.profiles) as profiles;
