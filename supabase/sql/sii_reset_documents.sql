-- =============================================================================
-- Borrar TODOS los documentos SII importados y empezar de cero.
--
-- NO borra conexiones SII ni movimientos del libro de banco (solo quita vínculos FC/FV).
-- Funciona aunque falte la columna sii_sales_document_id en bank_transactions.
--
-- Ejecutar en Supabase → SQL Editor.
-- =============================================================================

-- 1. Quitar vínculos con facturas SII en el libro de banco (solo columnas que existan)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bank_transactions'
      and column_name = 'sii_purchase_document_id'
  ) then
    update public.bank_transactions
    set sii_purchase_document_id = null
    where sii_purchase_document_id is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bank_transactions'
      and column_name = 'sii_sales_document_id'
  ) then
    update public.bank_transactions
    set sii_sales_document_id = null
    where sii_sales_document_id is not null;
  end if;
end $$;

-- 2. Borrar documentos SII
delete from public.sii_honorarium_receipts;
delete from public.sii_sales_documents;
delete from public.sii_purchase_documents;

-- 3. Reiniciar marcas de última importación
update public.sii_connections
set
  last_sync_at = null,
  last_sync_compras_at = null,
  last_sync_ventas_at = null,
  last_sync_honorarios_at = null;

-- Verificación (debe dar 0 en las tres):
-- select
--   (select count(*) from sii_purchase_documents) as compras,
--   (select count(*) from sii_sales_documents) as ventas,
--   (select count(*) from sii_honorarium_receipts) as honorarios;
