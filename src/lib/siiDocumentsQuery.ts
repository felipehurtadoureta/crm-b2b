/**
 * Consultas de documentos tributarios SII en Supabase.
 */
import { supabase } from '@/lib/supabase'
import { SII_SETUP_HINT } from '@/lib/siiSync'
import type { SiiHonorariumReceipt, SiiPurchaseDocument, SiiSalesDocument } from '@/types'

export const SII_PURCHASES_QUERY_KEY = ['sii-purchase-documents'] as const
export const SII_SALES_QUERY_KEY = ['sii-sales-documents'] as const
export const SII_HONORARIUM_QUERY_KEY = ['sii-honorarium-receipts'] as const

function isMissingTable(msg: string): boolean {
  return msg.includes('42P01') || /sii_/i.test(msg)
}

/** Último día del mes YYYY-MM */
export function lastDayOfMonthYm(ym: string): string {
  const [y, m] = ym.split('-')
  if (!y || !m) return ym
  const lastDay = new Date(Number(y), Number(m), 0).getDate()
  return `${y}-${m}-${String(lastDay).padStart(2, '0')}`
}

export type SiiDocumentsFilter = {
  connectionId?: string
  periodFrom?: string
  periodTo?: string
  search?: string
}

function applyPeriodFilter<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(
  q: T,
  dateCol: string,
  filter: SiiDocumentsFilter,
): T {
  if (filter.periodFrom) {
    q = q.gte(dateCol, `${filter.periodFrom}-01`)
  }
  if (filter.periodTo) {
    q = q.lte(dateCol, lastDayOfMonthYm(filter.periodTo))
  }
  return q
}

function matchesSearch(text: string, q: string): boolean {
  return text.toLowerCase().includes(q.trim().toLowerCase())
}

export async function fetchSiiPurchaseDocuments(filter: SiiDocumentsFilter = {}): Promise<SiiPurchaseDocument[]> {
  let q = supabase
    .from('sii_purchase_documents')
    .select(
      'id, connection_id, periodo, tipo_dte, folio, fecha_emision, rut_emisor, razon_social_emisor, monto_neto, monto_iva, monto_total, estado_rcv, company_id, sii_import_hash, raw, synced_at, created_at, updated_at',
    )
    .order('fecha_emision', { ascending: false })
    .limit(500)

  if (filter.connectionId) q = q.eq('connection_id', filter.connectionId)
  q = applyPeriodFilter(q, 'fecha_emision', filter)

  const { data, error } = await q
  if (error) {
    if (isMissingTable(error.message)) throw new Error(SII_SETUP_HINT)
    throw new Error(error.message)
  }

  let rows = (data ?? []) as SiiPurchaseDocument[]
  const term = filter.search?.trim()
  if (term) {
    rows = rows.filter(
      r =>
        matchesSearch(r.rut_emisor, term) ||
        matchesSearch(r.razon_social_emisor, term) ||
        matchesSearch(r.folio, term) ||
        matchesSearch(r.tipo_dte, term),
    )
  }
  return rows
}

export async function fetchSiiSalesDocuments(filter: SiiDocumentsFilter = {}): Promise<SiiSalesDocument[]> {
  let q = supabase
    .from('sii_sales_documents')
    .select(
      'id, connection_id, periodo, tipo_dte, folio, fecha_emision, rut_receptor, razon_social_receptor, monto_neto, monto_iva, monto_total, estado_rcv, company_id, sii_import_hash, raw, synced_at, created_at, updated_at',
    )
    .order('fecha_emision', { ascending: false })
    .limit(500)

  if (filter.connectionId) q = q.eq('connection_id', filter.connectionId)
  q = applyPeriodFilter(q, 'fecha_emision', filter)

  const { data, error } = await q
  if (error) {
    if (isMissingTable(error.message)) throw new Error(SII_SETUP_HINT)
    throw new Error(error.message)
  }

  let rows = (data ?? []) as SiiSalesDocument[]
  const term = filter.search?.trim()
  if (term) {
    rows = rows.filter(
      r =>
        matchesSearch(r.rut_receptor, term) ||
        matchesSearch(r.razon_social_receptor, term) ||
        matchesSearch(r.folio, term) ||
        matchesSearch(r.tipo_dte, term),
    )
  }
  return rows
}

export async function fetchSiiHonorariumReceipts(
  filter: SiiDocumentsFilter = {},
): Promise<SiiHonorariumReceipt[]> {
  let q = supabase
    .from('sii_honorarium_receipts')
    .select(
      'id, connection_id, periodo, numero_boleta, fecha, rut_prestador, rut_receptor, nombre_prestador, monto_bruto, retencion, liquido, estado, tipo_boleta, company_id, sii_import_hash, synced_at, created_at, updated_at',
    )
    .order('fecha', { ascending: false })
    .limit(500)

  if (filter.connectionId) q = q.eq('connection_id', filter.connectionId)
  q = applyPeriodFilter(q, 'fecha', filter)

  const { data, error } = await q
  if (error) {
    if (isMissingTable(error.message)) throw new Error(SII_SETUP_HINT)
    throw new Error(error.message)
  }

  let rows = (data ?? []) as SiiHonorariumReceipt[]
  const term = filter.search?.trim()
  if (term) {
    rows = rows.filter(
      r =>
        matchesSearch(r.rut_prestador, term) ||
        matchesSearch(r.nombre_prestador, term) ||
        matchesSearch(r.numero_boleta, term),
    )
  }
  return rows
}

/** Etiqueta corta del tipo DTE SII */
export function siiDteTypeLabel(tipo: string): string {
  const map: Record<string, string> = {
    '33': 'Factura',
    '34': 'Factura exenta',
    '39': 'Boleta',
    '41': 'Boleta exenta',
    '52': 'Guía despacho',
    '56': 'Nota débito',
    '61': 'Nota crédito',
  }
  return map[tipo] ?? `DTE ${tipo}`
}
