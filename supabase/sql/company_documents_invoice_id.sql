-- Vincular documentos de empresa a una factura (opcional).
-- Ejecutar en SQL Editor después de company_documents.sql y company_documents_quote_id.sql.
-- Una fila no debe tener cotización y factura a la vez (solo empresa general / cotización / factura).

alter table public.company_documents
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null;

create index if not exists company_documents_invoice_id_idx on public.company_documents (invoice_id);

alter table public.company_documents drop constraint if exists company_documents_quote_invoice_exclusive;

alter table public.company_documents add constraint company_documents_quote_invoice_exclusive
  check (
    quote_id is null or invoice_id is null
  );

comment on column public.company_documents.invoice_id is 'Factura asociada al adjunto (opcional); NULL = documento general o solo ligado por quote_id.';
