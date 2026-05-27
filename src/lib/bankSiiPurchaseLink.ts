/**
 * Vinculación libro de banco ↔ facturas de compra SII (RCV).
 */
import { supabase } from '@/lib/supabase'
import { SII_SETUP_HINT } from '@/lib/siiSync'
import {
  filterPurchasesForBankLink,
  finalizeBankLinkList,
  type BankLinkSearchOpts,
} from '@/lib/bankSiiLinkSearch'
import { siiDteTypeLabel } from '@/lib/siiDocumentsQuery'
import type { SiiPurchaseDocument } from '@/types'

export type { BankLinkSearchOpts }

export type SiiPurchasePaymentStatus = {
  total: number
  paid: number
  remaining: number
  label: string
  tone: 'paid' | 'partial' | 'pending'
}

const fmtClp = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

/** Estado de pago según total RCV y cargos bancarios vinculados (glosa FC). */
export function computeSiiPurchasePaymentStatus(total: number, paid: number): SiiPurchasePaymentStatus {
  const safeTotal = Math.max(0, Math.round(total))
  const safePaid = Math.max(0, Math.round(paid))
  const remaining = Math.max(0, safeTotal - safePaid)

  if (safeTotal > 0 && safePaid >= safeTotal) {
    return { total: safeTotal, paid: safePaid, remaining: 0, label: 'Pagada', tone: 'paid' }
  }
  if (safePaid > 0) {
    return {
      total: safeTotal,
      paid: safePaid,
      remaining,
      label: `Falta ${fmtClp(remaining)}`,
      tone: 'partial',
    }
  }
  return {
    total: safeTotal,
    paid: safePaid,
    remaining: safeTotal,
    label: 'Pendiente de pago',
    tone: 'pending',
  }
}

export function formatSiiPurchaseShort(doc: SiiPurchaseDocument): string {
  return `${siiDteTypeLabel(doc.tipo_dte)} ${doc.folio} · ${doc.razon_social_emisor || doc.rut_emisor}`
}

function ymMonthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Busca facturas de compra RCV para vincular desde el libro de banco. */
export async function searchSiiPurchasesForBankLink(
  search: string,
  opts: Omit<BankLinkSearchOpts, 'search'> = {},
): Promise<SiiPurchaseDocument[]> {
  const periodFrom = ymMonthsAgo(36)
  const { data, error } = await supabase
    .from('sii_purchase_documents')
    .select(
      'id, connection_id, periodo, tipo_dte, folio, fecha_emision, rut_emisor, razon_social_emisor, monto_neto, monto_iva, monto_total, estado_rcv, company_id, sii_import_hash, raw, synced_at, created_at, updated_at',
    )
    .gte('fecha_emision', `${periodFrom}-01`)
    .order('fecha_emision', { ascending: false })
    .limit(500)

  if (error) {
    if (error.message.includes('42P01')) throw new Error(SII_SETUP_HINT)
    throw new Error(error.message)
  }

  const linkable = filterPurchasesForBankLink((data ?? []) as SiiPurchaseDocument[])

  return finalizeBankLinkList(linkable, { search, ...opts }, doc => ({
    folio: doc.folio,
    rut: doc.rut_emisor,
    name: doc.razon_social_emisor,
    monto_total: Number(doc.monto_total),
  }))
}

export async function fetchSiiPurchaseDocumentsByIds(ids: string[]): Promise<Map<string, SiiPurchaseDocument>> {
  const map = new Map<string, SiiPurchaseDocument>()
  if (ids.length === 0) return map

  const { data, error } = await supabase
    .from('sii_purchase_documents')
    .select(
      'id, connection_id, periodo, tipo_dte, folio, fecha_emision, rut_emisor, razon_social_emisor, monto_neto, monto_iva, monto_total, estado_rcv, company_id, sii_import_hash, synced_at, created_at, updated_at',
    )
    .in('id', ids)

  if (error) throw new Error(error.message)
  for (const row of (data ?? []) as SiiPurchaseDocument[]) {
    map.set(row.id, row)
  }
  return map
}

/** Suma cargos bancarios (debit) vinculados por factura RCV con glosa FC. */
export async function fetchSiiPurchasePaidTotals(documentIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (documentIds.length === 0) return map

  const { data, error } = await supabase
    .from('bank_transactions')
    .select('sii_purchase_document_id, debit')
    .in('sii_purchase_document_id', documentIds)
    .eq('glosa', 'FC')

  if (error) {
    if (error.code === '42703') {
      throw new Error('Falta la columna sii_purchase_document_id. Ejecute supabase/sql/bank_sii_purchase_link.sql')
    }
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    const id = row.sii_purchase_document_id as string
    if (!id) continue
    map.set(id, (map.get(id) ?? 0) + Math.round(Number(row.debit ?? 0)))
  }
  return map
}

export type BankSiiPurchaseContext = {
  documents: Map<string, SiiPurchaseDocument>
  paidByDocumentId: Map<string, number>
}

export async function fetchBankSiiPurchaseContext(documentIds: string[]): Promise<BankSiiPurchaseContext> {
  const unique = [...new Set(documentIds.filter(Boolean))]
  const [documents, paidByDocumentId] = await Promise.all([
    fetchSiiPurchaseDocumentsByIds(unique),
    fetchSiiPurchasePaidTotals(unique),
  ])
  return { documents, paidByDocumentId }
}

export async function updateTransactionSiiPurchaseLink(
  transactionId: string,
  siiPurchaseDocumentId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ sii_purchase_document_id: siiPurchaseDocumentId })
    .eq('id', transactionId)

  if (error) {
    if (error.code === '42703') {
      throw new Error('Falta la columna sii_purchase_document_id. Ejecute supabase/sql/bank_sii_purchase_link.sql')
    }
    throw new Error(error.message)
  }
}
