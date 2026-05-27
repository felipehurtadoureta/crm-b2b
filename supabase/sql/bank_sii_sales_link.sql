-- Vincular movimientos de banco (glosa FV) con facturas de venta del RCV SII.
-- Ejecutar después de bank_book.sql y sii_documents.sql.

alter table public.bank_transactions
  add column if not exists sii_sales_document_id uuid
    references public.sii_sales_documents (id) on delete set null;

create index if not exists bank_transactions_sii_sales_idx
  on public.bank_transactions (sii_sales_document_id)
  where sii_sales_document_id is not null;

comment on column public.bank_transactions.sii_sales_document_id is
  'Factura de venta RCV SII vinculada (glosa FV). Varios movimientos pueden apuntar a la misma factura.';
