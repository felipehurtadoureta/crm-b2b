-- Documentos por empresa: ejecutar en Supabase SQL Editor.
-- Luego ejecutá supabase/sql/company_documents_storage.sql (bucket + políticas Storage; sin eso: "Bucket not found").

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  category text not null default 'otro'
    check (category in ('contrato', 'orden_compra', 'factura', 'otro')),
  uploaded_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists company_documents_company_id_idx on public.company_documents (company_id);

alter table public.company_documents enable row level security;

-- Políticas permisivas de ejemplo (reemplazar por reglas finas en producción).
create policy "company_documents_select_authenticated"
  on public.company_documents for select
  to authenticated
  using (true);

create policy "company_documents_insert_authenticated"
  on public.company_documents for insert
  to authenticated
  with check (true);

create policy "company_documents_delete_authenticated"
  on public.company_documents for delete
  to authenticated
  using (true);
