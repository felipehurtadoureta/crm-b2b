-- =============================================================================
-- Re-vincular documentos SII ↔ empresas CRM por RUT
--
-- Usa la misma normalización que sii-import (Edge Function):
--   quitar puntos y espacios, pasar a mayúsculas.
--
-- Ejecutar en Supabase SQL Editor (como super_admin / postgres).
-- Idempotente: puede ejecutarse varias veces.
-- =============================================================================

-- Normaliza RUT igual que normalizeRut() en supabase/functions/_shared/siiAuth.ts
create or replace function public.crm_normalize_rut(p_rut text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(
    replace(
      replace(
        coalesce(trim(p_rut), ''),
        '.',
        ''
      ),
      ' ',
      ''
    )
  );
$$;

comment on function public.crm_normalize_rut(text) is
  'Normaliza RUT para cruce SII ↔ companies (sin puntos ni espacios, mayúsculas).';

-- Mapa RUT normalizado → company_id (si hay duplicados de RUT en companies, toma la más antigua)
create or replace view public.crm_companies_by_rut as
select distinct on (public.crm_normalize_rut(c.rut))
  c.id as company_id,
  public.crm_normalize_rut(c.rut) as rut_key,
  c.name,
  c.rut as rut_raw
from public.companies c
where c.rut is not null
  and trim(c.rut) <> ''
  and public.crm_normalize_rut(c.rut) <> ''
order by public.crm_normalize_rut(c.rut), c.created_at asc;

-- ---------------------------------------------------------------------------
-- 1) Ventas (RCV): cliente = rut_receptor → empresa CRM
-- ---------------------------------------------------------------------------
update public.sii_sales_documents sd
set
  company_id = m.company_id,
  updated_at = now()
from public.crm_companies_by_rut m
where public.crm_normalize_rut(sd.rut_receptor) = m.rut_key
  and sd.company_id is distinct from m.company_id;

-- ---------------------------------------------------------------------------
-- 2) Compras (RCV): proveedor = rut_emisor → empresa CRM
-- ---------------------------------------------------------------------------
update public.sii_purchase_documents pd
set
  company_id = m.company_id,
  updated_at = now()
from public.crm_companies_by_rut m
where public.crm_normalize_rut(pd.rut_emisor) = m.rut_key
  and pd.company_id is distinct from m.company_id;

-- ---------------------------------------------------------------------------
-- 3) Honorarios: prestador = rut_prestador → empresa CRM (igual que sii-import)
-- ---------------------------------------------------------------------------
update public.sii_honorarium_receipts hr
set
  company_id = m.company_id,
  updated_at = now()
from public.crm_companies_by_rut m
where public.crm_normalize_rut(hr.rut_prestador) = m.rut_key
  and hr.company_id is distinct from m.company_id;

-- ---------------------------------------------------------------------------
-- 4) (Opcional) Alinear company_id en invoices técnicas de seguimiento
--    Requiere: supabase/sql/invoices_followup_from_sii.sql
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invoices'
      and column_name = 'sii_sales_document_id'
  ) then
    update public.invoices i
    set
      company_id = sd.company_id,
      updated_at = now()
    from public.sii_sales_documents sd
    where i.sii_sales_document_id = sd.id
      and sd.company_id is not null
      and i.company_id is distinct from sd.company_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Resumen (filas aún sin empresa porque no hay RUT coincidente en CRM)
-- ---------------------------------------------------------------------------
select 'sii_sales_documents' as tabla,
  count(*) filter (where company_id is not null) as vinculados,
  count(*) filter (where company_id is null) as sin_empresa,
  count(*) as total
from public.sii_sales_documents
union all
select 'sii_purchase_documents',
  count(*) filter (where company_id is not null),
  count(*) filter (where company_id is null),
  count(*)
from public.sii_purchase_documents
union all
select 'sii_honorarium_receipts',
  count(*) filter (where company_id is not null),
  count(*) filter (where company_id is null),
  count(*)
from public.sii_honorarium_receipts;

-- RUTs en ventas SII que no encontraron empresa (útil para cargar RUT en CRM)
select distinct
  sd.rut_receptor,
  sd.razon_social_receptor,
  count(*) as documentos
from public.sii_sales_documents sd
where sd.company_id is null
  and public.crm_normalize_rut(sd.rut_receptor) <> ''
group by sd.rut_receptor, sd.razon_social_receptor
order by documentos desc, sd.rut_receptor
limit 50;
