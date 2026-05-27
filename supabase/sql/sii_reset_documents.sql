-- =============================================================================
-- Borrar documentos SII importados (para re-importar con fechas corregidas).
-- Ejecutar en Supabase SQL Editor como super_admin de la base.
-- NO borra conexiones ni claves; solo los documentos de las 3 tablas.
-- =============================================================================

-- Opcional: solo una conexión (reemplace el UUID)
-- delete from public.sii_purchase_documents where connection_id = 'UUID-AQUI';
-- delete from public.sii_sales_documents where connection_id = 'UUID-AQUI';
-- delete from public.sii_honorarium_receipts where connection_id = 'UUID-AQUI';

-- Todas las conexiones:
truncate table public.sii_honorarium_receipts;
truncate table public.sii_sales_documents;
truncate table public.sii_purchase_documents;

-- Reinicia marcas de última sync (opcional)
update public.sii_connections
set
  last_sync_at = null,
  last_sync_compras_at = null,
  last_sync_ventas_at = null,
  last_sync_honorarios_at = null;
