-- =============================================================================
-- Migrar documentos mal importados: compras → ventas
--
-- ⚠️ Si este script da error, use en su lugar:
--    supabase/sql/sii_reset_documents.sql
--    y re-importe desde SII → pestaña Ventas.
--
-- Use cuando importó archivos RCV de VENTAS (facturas emitidas) en la pestaña
-- Compras y quedaron en sii_purchase_documents.
--
-- Recupera RUT cliente desde raw (jsonb) y mueve a sii_sales_documents.
-- Opcional: reemplace el UUID de conexión para migrar solo una empresa.
--
-- Ejecutar en Supabase SQL Editor.
-- =============================================================================

create extension if not exists pgcrypto;

-- Opcional: descomente y ponga su connection_id
-- \set connection_filter 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'

begin;

create temp table _sii_migrate_to_sales on commit drop as
select
  p.id as old_id,
  p.connection_id,
  p.periodo,
  p.tipo_dte,
  p.folio,
  p.fecha_emision,
  coalesce(
    nullif(trim(p.raw->>'RUT Cliente'), ''),
    nullif(trim(p.raw->>'RUT Receptor'), ''),
    nullif(trim(p.raw->>'Rut cliente'), ''),
    nullif(trim(p.raw->>'Rut Cliente'), ''),
    nullif(trim(p.rut_emisor), '')
  ) as rut_receptor,
  coalesce(
    nullif(trim(p.raw->>'Razón Social Cliente'), ''),
    nullif(trim(p.raw->>'Razon Social Cliente'), ''),
    nullif(trim(p.raw->>'Razón Social'), ''),
    nullif(trim(p.raw->>'Razon Social'), ''),
    nullif(trim(p.razon_social_emisor), '')
  ) as razon_social_receptor,
  p.monto_neto,
  p.monto_iva,
  p.monto_total,
  p.estado_rcv,
  p.company_id,
  p.raw,
  p.synced_at,
  p.created_at,
  p.updated_at,
  encode(
    digest(
      p.connection_id::text
        || '|venta|'
        || p.periodo
        || '|'
        || p.tipo_dte
        || '|'
        || p.folio
        || '|'
        || coalesce(
          nullif(trim(p.raw->>'RUT Cliente'), ''),
          nullif(trim(p.raw->>'RUT Receptor'), ''),
          nullif(trim(p.rut_emisor), '')
        )
        || '|'
        || p.fecha_emision::text,
      'sha256'
    ),
    'hex'
  ) as new_hash
from public.sii_purchase_documents p
where p.raw is not null
  -- and p.connection_id = :'connection_filter'::uuid
;

-- Insertar en ventas (conserva el mismo id para no romper referencias)
insert into public.sii_sales_documents (
  id,
  connection_id,
  periodo,
  tipo_dte,
  folio,
  fecha_emision,
  rut_receptor,
  razon_social_receptor,
  monto_neto,
  monto_iva,
  monto_total,
  estado_rcv,
  company_id,
  sii_import_hash,
  raw,
  synced_at,
  created_at,
  updated_at
)
select
  m.old_id,
  m.connection_id,
  m.periodo,
  m.tipo_dte,
  m.folio,
  m.fecha_emision,
  coalesce(m.rut_receptor, ''),
  coalesce(m.razon_social_receptor, ''),
  m.monto_neto,
  m.monto_iva,
  m.monto_total,
  m.estado_rcv,
  m.company_id,
  m.new_hash,
  m.raw,
  m.synced_at,
  m.created_at,
  m.updated_at
from _sii_migrate_to_sales m
on conflict (id) do update set
  rut_receptor = excluded.rut_receptor,
  razon_social_receptor = excluded.razon_social_receptor,
  sii_import_hash = excluded.sii_import_hash,
  raw = excluded.raw,
  updated_at = now();

-- Mover vínculos del libro de banco (FC mal usado → FV)
update public.bank_transactions bt
set
  sii_sales_document_id = bt.sii_purchase_document_id,
  sii_purchase_document_id = null,
  glosa = 'FV'
where bt.sii_purchase_document_id in (select old_id from _sii_migrate_to_sales)
  and bt.sii_purchase_document_id is not null;

-- Borrar registros migrados de compras
delete from public.sii_purchase_documents p
using _sii_migrate_to_sales m
where p.id = m.old_id
  and exists (select 1 from public.sii_sales_documents s where s.id = m.old_id);

-- Actualizar marca de sync
update public.sii_connections c
set
  last_sync_ventas_at = coalesce(c.last_sync_ventas_at, now()),
  last_sync_at = now()
where c.id in (select distinct connection_id from _sii_migrate_to_sales);

commit;

-- Verificación:
-- select count(*) from sii_sales_documents;
-- select count(*) from sii_purchase_documents;
