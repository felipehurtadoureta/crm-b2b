-- Vincular documentos de empresa a una cotización (opcional). Ejecutar en Supabase SQL Editor tras company_documents.sql.

alter table public.company_documents
  add column if not exists quote_id uuid references public.quotes (id) on delete set null;

create index if not exists company_documents_quote_id_idx on public.company_documents (quote_id);

comment on column public.company_documents.quote_id is 'Cotización asociada al adjunto (gestor de documentos en ficha empresa).';
