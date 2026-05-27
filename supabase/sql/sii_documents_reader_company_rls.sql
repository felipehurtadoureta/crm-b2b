-- Permite a usuarios reader ver documentos SII de empresas que pueden consultar en CRM.
-- (KAM y super_admin ya tenían acceso global en sii_documents.sql)

drop policy if exists sii_sales_documents_select_reader on public.sii_sales_documents;
create policy sii_sales_documents_select_reader on public.sii_sales_documents
  for select to authenticated
  using (
    company_id is not null
    and public.crm_user_can_read_company(company_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'reader'
    )
  );

drop policy if exists sii_purchase_documents_select_reader on public.sii_purchase_documents;
create policy sii_purchase_documents_select_reader on public.sii_purchase_documents
  for select to authenticated
  using (
    company_id is not null
    and public.crm_user_can_read_company(company_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'reader'
    )
  );
