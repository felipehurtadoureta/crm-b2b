import { supabase } from '@/lib/supabase'
import { COMPANY_DOCUMENTS_BUCKET } from '@/lib/companyDocumentsUpload'
import type { CompanyDocument, Invoice, InvoiceStatus } from '@/types'

export interface InvoiceListRow extends Invoice {
  companies?: { id: string; name: string } | null
  quotes?: { id: string; quote_number: string; title: string } | null
}

export async function fetchInvoicesList(): Promise<InvoiceListRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, companies(id, name), quotes(id, quote_number, title)')
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }

  return ((data ?? []) as unknown[]).map(row => {
    const r = row as Record<string, unknown>
    const co = r.companies
    const qu = r.quotes
    return {
      ...r,
      companies: Array.isArray(co) ? co[0] : co,
      quotes: Array.isArray(qu) ? qu[0] : qu,
    } as InvoiceListRow
  })
}

export async function fetchInvoiceDocuments(invoiceId: string): Promise<CompanyDocument[]> {
  const { data, error } = await supabase
    .from('company_documents')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01' || error.code === '42703') return []
    throw new Error(error.message)
  }
  return (data ?? []) as CompanyDocument[]
}

export async function updateInvoice(
  invoiceId: string,
  patch: {
    invoice_number?: string
    title?: string | null
    status?: InvoiceStatus
    total?: number
    currency?: string
    notes?: string | null
    paid_at?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('invoices').update(patch).eq('id', invoiceId)
  if (error) throw new Error(error.message)
}

export function invoicesListQueryKey() {
  return ['invoices-list'] as const
}

/** Ficha empresa v2: pestaña Facturas en seguimiento comercial con factura preseleccionada. */
export function companyInvoiceFollowupHref(companyId: string, invoiceId: string): string {
  const q = new URLSearchParams({ cfInvoiceId: invoiceId })
  return `/companies/${companyId}/v2?${q.toString()}#seccion-seguimientos`
}

/** Elimina PDFs adjuntos, filas en company_documents y la factura. */
export async function deleteInvoice(invoiceId: string): Promise<void> {
  const docs = await fetchInvoiceDocuments(invoiceId)
  const paths = docs.map(d => d.storage_path).filter(Boolean)
  if (paths.length) {
    await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove(paths)
  }
  if (docs.length) {
    const { error: docErr } = await supabase.from('company_documents').delete().eq('invoice_id', invoiceId)
    if (docErr) throw new Error(docErr.message)
  }
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId)
  if (error) throw new Error(error.message)
}
