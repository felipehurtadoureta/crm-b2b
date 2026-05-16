import { supabase } from '@/lib/supabase'
import type { CompanyDocument } from '@/types'

export async function fetchCompanyDocuments(companyId: string): Promise<CompanyDocument[]> {
  const { data, error } = await supabase
    .from('company_documents')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) {
    const missing = error.message.includes('relation') || error.code === '42P01'
    if (missing) {
      throw new Error(
        'Falta crear la tabla en Supabase. Ejecute el script supabase/sql/company_documents.sql y el bucket Storage.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as CompanyDocument[]
}

export function companyDocumentsQueryOptions(companyId: string) {
  return {
    queryKey: ['company-documents', companyId] as const,
    queryFn: () => fetchCompanyDocuments(companyId),
  }
}

/** Documentos de la empresa marcados para esta cotización */
export async function fetchCompanyDocumentsByQuoteId(quoteId: string): Promise<CompanyDocument[]> {
  const { data, error } = await supabase
    .from('company_documents')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42703' || error.message.toLowerCase().includes('quote_id')) {
      throw new Error(
        'Falta la columna quote_id en company_documents. Ejecute supabase/sql/company_documents_quote_id.sql en Supabase.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as CompanyDocument[]
}

export function companyDocumentsByQuoteQueryOptions(quoteId: string | undefined, enabled: boolean) {
  return {
    queryKey: ['company-documents-by-quote', quoteId ?? ''] as const,
    queryFn: () => fetchCompanyDocumentsByQuoteId(quoteId!),
    enabled: Boolean(quoteId && enabled),
  }
}
