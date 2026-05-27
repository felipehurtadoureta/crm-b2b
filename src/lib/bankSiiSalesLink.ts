/**
 * Vinculación libro de banco ↔ facturas de venta SII (RCV).
 */
import { supabase } from '@/lib/supabase'
import { SII_SETUP_HINT } from '@/lib/siiSync'
import {
  filterSalesForBankLink,
  finalizeBankLinkList,
  type BankLinkSearchOpts,
} from '@/lib/bankSiiLinkSearch'
import { siiDteTypeLabel } from '@/lib/siiDocumentsQuery'
import type { SiiSalesDocument } from '@/types'

export type { BankLinkSearchOpts }

export type SiiSalesCollectionStatus = {
  total: number
  collected: number
  remaining: number
  label: string
  tone: 'paid' | 'partial' | 'pending'
}

const fmtClp = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

/** Estado de cobro según total RCV y abonos bancarios vinculados (glosa FV). */
export function computeSiiSalesCollectionStatus(total: number, collected: number): SiiSalesCollectionStatus {
  const safeTotal = Math.max(0, Math.round(total))
  const safeCollected = Math.max(0, Math.round(collected))
  const remaining = Math.max(0, safeTotal - safeCollected)

  if (safeTotal > 0 && safeCollected >= safeTotal) {
    return { total: safeTotal, collected: safeCollected, remaining: 0, label: 'Cobrada', tone: 'paid' }
  }
  if (safeCollected > 0) {
    return {
      total: safeTotal,
      collected: safeCollected,
      remaining,
      label: `Falta ${fmtClp(remaining)}`,
      tone: 'partial',
    }
  }
  return {
    total: safeTotal,
    collected: safeCollected,
    remaining: safeTotal,
    label: 'Pendiente de cobro',
    tone: 'pending',
  }
}

export function formatSiiSalesShort(doc: SiiSalesDocument): string {
  return `${siiDteTypeLabel(doc.tipo_dte)} ${doc.folio} · ${doc.razon_social_receptor || doc.rut_receptor}`
}

function ymMonthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Busca facturas de venta RCV para vincular desde el libro de banco. */
export async function searchSiiSalesForBankLink(
  search: string,
  opts: Omit<BankLinkSearchOpts, 'search'> = {},
): Promise<SiiSalesDocument[]> {
  const periodFrom = ymMonthsAgo(36)
  const { data, error } = await supabase
    .from('sii_sales_documents')
    .select(
      'id, connection_id, periodo, tipo_dte, folio, fecha_emision, rut_receptor, razon_social_receptor, monto_neto, monto_iva, monto_total, estado_rcv, company_id, sii_import_hash, raw, synced_at, created_at, updated_at',
    )
    .gte('fecha_emision', `${periodFrom}-01`)
    .order('fecha_emision', { ascending: false })
    .limit(500)

  if (error) {
    if (error.message.includes('42P01')) throw new Error(SII_SETUP_HINT)
    throw new Error(error.message)
  }

  const linkable = filterSalesForBankLink((data ?? []) as SiiSalesDocument[])

  return finalizeBankLinkList(linkable, { search, ...opts }, doc => ({
    folio: doc.folio,
    rut: doc.rut_receptor,
    name: doc.razon_social_receptor,
    monto_total: Number(doc.monto_total),
  }))
}

export async function fetchSiiSalesDocumentsByIds(ids: string[]): Promise<Map<string, SiiSalesDocument>> {
  const map = new Map<string, SiiSalesDocument>()
  if (ids.length === 0) return map

  const { data, error } = await supabase
    .from('sii_sales_documents')
    .select(
      'id, connection_id, periodo, tipo_dte, folio, fecha_emision, rut_receptor, razon_social_receptor, monto_neto, monto_iva, monto_total, estado_rcv, company_id, sii_import_hash, synced_at, created_at, updated_at',
    )
    .in('id', ids)

  if (error) throw new Error(error.message)
  for (const row of (data ?? []) as SiiSalesDocument[]) {
    map.set(row.id, row)
  }
  return map
}

/** Suma abonos bancarios (credit) vinculados por factura RCV con glosa FV. */
export async function fetchSiiSalesCollectedTotals(documentIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (documentIds.length === 0) return map

  const { data, error } = await supabase
    .from('bank_transactions')
    .select('sii_sales_document_id, credit')
    .in('sii_sales_document_id', documentIds)
    .eq('glosa', 'FV')

  if (error) {
    if (error.code === '42703') {
      throw new Error('Falta la columna sii_sales_document_id. Ejecute supabase/sql/bank_sii_sales_link.sql')
    }
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    const id = row.sii_sales_document_id as string
    if (!id) continue
    map.set(id, (map.get(id) ?? 0) + Math.round(Number(row.credit ?? 0)))
  }
  return map
}

export type BankSiiSalesContext = {
  documents: Map<string, SiiSalesDocument>
  collectedByDocumentId: Map<string, number>
}

export async function fetchBankSiiSalesContext(documentIds: string[]): Promise<BankSiiSalesContext> {
  const unique = [...new Set(documentIds.filter(Boolean))]
  const [documents, collectedByDocumentId] = await Promise.all([
    fetchSiiSalesDocumentsByIds(unique),
    fetchSiiSalesCollectedTotals(unique),
  ])
  return { documents, collectedByDocumentId }
}

export async function updateTransactionSiiSalesLink(
  transactionId: string,
  siiSalesDocumentId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ sii_sales_document_id: siiSalesDocumentId })
    .eq('id', transactionId)

  if (error) {
    if (error.code === '42703') {
      throw new Error('Falta la columna sii_sales_document_id. Ejecute supabase/sql/bank_sii_sales_link.sql')
    }
    throw new Error(error.message)
  }
}
