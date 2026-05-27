-- Vincular movimientos de banco (glosa FC) con facturas de compra del RCV SII.
-- Ejecutar después de bank_book.sql y sii_documents.sql.

alter table public.bank_transactions
  add column if not exists sii_purchase_document_id uuid
    references public.sii_purchase_documents (id) on delete set null;

create index if not exists bank_transactions_sii_purchase_idx
  on public.bank_transactions (sii_purchase_document_id)
  where sii_purchase_document_id is not null;

comment on column public.bank_transactions.sii_purchase_document_id is
  'Factura de compra RCV SII vinculada (glosa FC). Varios movimientos pueden apuntar a la misma factura.';
