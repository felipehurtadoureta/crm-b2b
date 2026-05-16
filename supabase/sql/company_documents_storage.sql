-- Crear bucket de Storage y políticas para documentos de empresa.
-- Ejecutar en SQL Editor DESPUÉS de company_documents.sql.
--
-- Si tu proyecto tiene la columna file_size_limit, puedes ejecutar también:
--   update storage.buckets set file_size_limit = 10485760 where id = 'company-documents';
-- (10 MB a nivel servidor; la app también valida tamaño y tipos.)

insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;

-- Políticas en storage.objects

drop policy if exists "company_documents_storage_select" on storage.objects;
create policy "company_documents_storage_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'company-documents');

drop policy if exists "company_documents_storage_insert" on storage.objects;
create policy "company_documents_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'company-documents');

drop policy if exists "company_documents_storage_update" on storage.objects;
create policy "company_documents_storage_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'company-documents');

drop policy if exists "company_documents_storage_delete" on storage.objects;
create policy "company_documents_storage_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'company-documents');
