import { supabase } from '@/lib/supabase'
import type { CompanyDocument, CompanyDocumentCategory } from '@/types'

export const COMPANY_DOCUMENT_CATEGORY_LABEL: Record<CompanyDocumentCategory, string> = {
  contrato: 'Contrato',
  orden_compra: 'Orden de compra',
  factura: 'Factura',
  otro: 'Otro',
}

export interface CompanyDocumentListRow extends CompanyDocument {
  companies?: { id: string; name: string } | null
  quotes?: { id: string; quote_number: string; title?: string | null } | null
  invoices?: { id: string; invoice_number: string; title?: string | null } | null
}

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

function normalizeEmbed<T>(v: unknown): T | null {
  if (v == null) return null
  const one = Array.isArray(v) ? v[0] : v
  return (one ?? null) as T | null
}

/** Todos los documentos del CRM (vista global del gestor). */
export async function fetchAllCompanyDocuments(): Promise<CompanyDocumentListRow[]> {
  // Sin embed `invoices(...)`: PostgREST falla si falta FK/columna invoice_id en el proyecto.
  const { data, error } = await supabase
    .from('company_documents')
    .select('*, companies(id, name), quotes(id, quote_number, title)')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    if (error.message.includes('quotes') && error.message.includes('relationship')) {
      const { data: plain, error: plainErr } = await supabase
        .from('company_documents')
        .select('*, companies(id, name)')
        .order('created_at', { ascending: false })
      if (plainErr) throw new Error(plainErr.message)
      return enrichDocumentsWithInvoices((plain ?? []) as CompanyDocumentListRow[])
    }
    throw new Error(error.message)
  }

  const rows = ((data ?? []) as unknown[]).map(row => {
    const r = row as Record<string, unknown>
    return {
      ...r,
      companies: normalizeEmbed<CompanyDocumentListRow['companies']>(r.companies),
      quotes: normalizeEmbed<CompanyDocumentListRow['quotes']>(r.quotes),
      invoices: null,
    } as CompanyDocumentListRow
  })

  return enrichDocumentsWithInvoices(rows)
}

async function enrichDocumentsWithInvoices(
  rows: CompanyDocumentListRow[],
): Promise<CompanyDocumentListRow[]> {
  const invoiceIds = [...new Set(rows.map(r => r.invoice_id).filter((id): id is string => Boolean(id)))]
  if (!invoiceIds.length) return rows

  const { data: invs, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, title')
    .in('id', invoiceIds)

  if (error) {
    if (error.code === '42P01') return rows
    return rows
  }

  const map = new Map<string, NonNullable<CompanyDocumentListRow['invoices']>>()
  for (const inv of invs ?? []) {
    const i = inv as { id: string; invoice_number: string; title?: string | null }
    map.set(i.id, i)
  }

  return rows.map(r => ({
    ...r,
    invoices: r.invoice_id ? map.get(r.invoice_id) ?? null : null,
  }))
}

export function allCompanyDocumentsQueryKey() {
  return ['company-documents-all'] as const
}

export function allCompanyDocumentsQueryOptions() {
  return {
    queryKey: allCompanyDocumentsQueryKey(),
    queryFn: fetchAllCompanyDocuments,
  }
}
