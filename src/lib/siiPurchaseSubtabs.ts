/**
 * Clasificación de compras RCV: facturas, notas de crédito y guías de despacho.
 */
import type { SiiPurchaseDocument } from '@/types'

export type ComprasSubTabId = 'documentos' | 'notas_credito' | 'guias_despacho'

export type ComprasSortBy = 'fecha_desc' | 'fecha_asc' | 'folio_asc' | 'folio_desc'

export const COMPRAS_SORT_OPTIONS: { value: ComprasSortBy; label: string }[] = [
  { value: 'fecha_desc', label: 'Fecha (más reciente)' },
  { value: 'fecha_asc', label: 'Fecha (más antigua)' },
  { value: 'folio_asc', label: 'Nº factura (menor a mayor)' },
  { value: 'folio_desc', label: 'Nº factura (mayor a menor)' },
]

/** Tipos DTE SII — compras */
export const SII_TIPO_NOTA_CREDITO = new Set(['61'])
export const SII_TIPO_GUIA_DESPACHO = new Set(['50', '52'])

export function normalizeSiiRut(rut: string): string {
  return rut.replace(/\./g, '').replace(/-/g, '').trim().toUpperCase()
}

/** Normaliza folio para emparejar "5" con "005". */
export function normalizeFolio(folio: string): string {
  const s = String(folio).trim()
  if (!s) return s
  if (/^\d+$/.test(s)) return String(Number(s))
  return s
}

export function purchaseDocKey(rut: string, folio: string): string {
  return `${normalizeSiiRut(rut)}|${normalizeFolio(folio)}`
}

/** Folio de factura referenciada por la NC (columna RCV «Folio Docto. Referencia»). */
export function extractFolioFacturaReferencia(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const v =
    o['Folio Docto. Referencia'] ??
    o['Folio Docto Referencia'] ??
    o['Folio Documento Referencia'] ??
    o['NCE o NDE sobre Fact. de Compra'] ??
    o['NCE o NDE sobre Fact de Compra'] ??
    o['folio_referencia'] ??
    o['Folio Referencia']
  const s = String(v ?? '').trim()
  if (!s || s === '0') return null
  return normalizeFolio(s)
}

export function isNotaCreditoCompra(doc: SiiPurchaseDocument): boolean {
  return SII_TIPO_NOTA_CREDITO.has(String(doc.tipo_dte).trim())
}

export function isGuiaDespachoCompra(doc: SiiPurchaseDocument): boolean {
  return SII_TIPO_GUIA_DESPACHO.has(String(doc.tipo_dte).trim())
}

function folioSortKey(folio: string): number {
  const n = Number(String(folio).replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : Number.NaN
}

function compareFolio(a: string, b: string, asc: boolean): number {
  const ka = folioSortKey(a)
  const kb = folioSortKey(b)
  const aNum = Number.isFinite(ka)
  const bNum = Number.isFinite(kb)
  if (aNum && bNum && ka !== kb) return asc ? ka - kb : kb - ka
  if (aNum && !bNum) return asc ? -1 : 1
  if (!aNum && bNum) return asc ? 1 : -1
  const sa = String(a).trim()
  const sb = String(b).trim()
  return asc ? sa.localeCompare(sb, 'es', { numeric: true }) : sb.localeCompare(sa, 'es', { numeric: true })
}

export function sortPurchaseDocuments(
  docs: SiiPurchaseDocument[],
  sortBy: ComprasSortBy,
): SiiPurchaseDocument[] {
  const copy = [...docs]
  copy.sort((a, b) => {
    if (sortBy.startsWith('fecha')) {
      const diff = new Date(a.fecha_emision).getTime() - new Date(b.fecha_emision).getTime()
      return sortBy === 'fecha_asc' ? diff : -diff
    }
    return compareFolio(a.folio, b.folio, sortBy === 'folio_asc')
  })
  return copy
}

export type NotaCreditoGroup = {
  nota: SiiPurchaseDocument
  factura: SiiPurchaseDocument | null
  /** Folio referenciado en la NC (desde raw), aunque la factura no esté en el período. */
  folioReferencia: string | null
}

export function sortNotaCreditoGroups(groups: NotaCreditoGroup[], sortBy: ComprasSortBy): NotaCreditoGroup[] {
  const copy = [...groups]
  copy.sort((a, b) => {
    if (sortBy.startsWith('fecha')) {
      const da = a.factura?.fecha_emision ?? a.nota.fecha_emision
      const db = b.factura?.fecha_emision ?? b.nota.fecha_emision
      const diff = new Date(da).getTime() - new Date(db).getTime()
      return sortBy === 'fecha_asc' ? diff : -diff
    }
    const fa = a.factura?.folio ?? a.folioReferencia ?? a.nota.folio
    const fb = b.factura?.folio ?? b.folioReferencia ?? b.nota.folio
    return compareFolio(fa, fb, sortBy === 'folio_asc')
  })
  return copy
}

export type ComprasPartition = {
  documentos: SiiPurchaseDocument[]
  notasCredito: NotaCreditoGroup[]
  guiasDespacho: SiiPurchaseDocument[]
  facturaIdsEnNotas: Set<string>
}

/** Separa compras en sub-pestañas y vincula NC con su factura por RUT emisor + folio referencia. */
export function partitionCompras(documents: SiiPurchaseDocument[]): ComprasPartition {
  const invoiceMap = new Map<string, SiiPurchaseDocument>()

  for (const doc of documents) {
    if (!isNotaCreditoCompra(doc) && !isGuiaDespachoCompra(doc)) {
      invoiceMap.set(purchaseDocKey(doc.rut_emisor, doc.folio), doc)
    }
  }

  const notasCredito: NotaCreditoGroup[] = []
  const facturaIdsEnNotas = new Set<string>()

  for (const doc of documents) {
    if (!isNotaCreditoCompra(doc)) continue
    const folioReferencia = extractFolioFacturaReferencia(doc.raw)
    const factura = folioReferencia
      ? (invoiceMap.get(purchaseDocKey(doc.rut_emisor, folioReferencia)) ?? null)
      : null
    if (factura) facturaIdsEnNotas.add(factura.id)
    notasCredito.push({ nota: doc, factura, folioReferencia })
  }

  const guiasDespacho = documents.filter(isGuiaDespachoCompra)

  const documentos = documents.filter(
    doc =>
      !isNotaCreditoCompra(doc) &&
      !isGuiaDespachoCompra(doc) &&
      !facturaIdsEnNotas.has(doc.id),
  )

  return { documentos, notasCredito, guiasDespacho, facturaIdsEnNotas }
}
