-- Enlaza facturas de seguimiento con documentos SII (RCV Ventas).
-- Permite que seguimiento comercial use SII como fuente y no el módulo legacy.

alter table public.invoices
  add column if not exists sii_sales_document_id uuid
  references public.sii_sales_documents (id) on delete set null;

create unique index if not exists invoices_sii_sales_document_id_uidx
  on public.invoices (sii_sales_document_id)
  where sii_sales_document_id is not null;
