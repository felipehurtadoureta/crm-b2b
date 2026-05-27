/**
 * Clasificación de ventas RCV: facturas, notas de crédito y guías de despacho.
 */
import type { SiiSalesDocument } from '@/types'
import {
  normalizeFolio,
  normalizeSiiRut,
  SII_TIPO_GUIA_DESPACHO,
  SII_TIPO_NOTA_CREDITO,
  type ComprasSortBy,
} from '@/lib/siiPurchaseSubtabs'

export type VentasSubTabId = 'documentos' | 'notas_credito' | 'guias_despacho'

export { COMPRAS_SORT_OPTIONS as VENTAS_SORT_OPTIONS } from '@/lib/siiPurchaseSubtabs'
export type { ComprasSortBy as VentasSortBy } from '@/lib/siiPurchaseSubtabs'

export function salesDocKey(rut: string, folio: string): string {
  return `${normalizeSiiRut(rut)}|${normalizeFolio(folio)}`
}

/** Folio de factura referenciada por la NC (columna RCV «Folio Docto. Referencia»). */
export function extractFolioFacturaReferenciaVenta(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const v =
    o['Folio Docto. Referencia'] ??
    o['Folio Docto Referencia'] ??
    o['Folio Documento Referencia'] ??
    o['NCE o NDE sobre Fact. de Venta'] ??
    o['NCE o NDE sobre Fact de Venta'] ??
    o['folio_referencia'] ??
    o['Folio Referencia']
  const s = String(v ?? '').trim()
  if (!s || s === '0') return null
  return normalizeFolio(s)
}

export function isNotaCreditoVenta(doc: SiiSalesDocument): boolean {
  return SII_TIPO_NOTA_CREDITO.has(String(doc.tipo_dte).trim())
}

export function isGuiaDespachoVenta(doc: SiiSalesDocument): boolean {
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

export function sortSalesDocuments(docs: SiiSalesDocument[], sortBy: ComprasSortBy): SiiSalesDocument[] {
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

export type NotaCreditoVentaGroup = {
  nota: SiiSalesDocument
  factura: SiiSalesDocument | null
  folioReferencia: string | null
}

export function sortNotaCreditoVentaGroups(
  groups: NotaCreditoVentaGroup[],
  sortBy: ComprasSortBy,
): NotaCreditoVentaGroup[] {
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

export type VentasPartition = {
  documentos: SiiSalesDocument[]
  notasCredito: NotaCreditoVentaGroup[]
  guiasDespacho: SiiSalesDocument[]
  facturaIdsEnNotas: Set<string>
}

/** Separa ventas en sub-pestañas y vincula NC con su factura por RUT receptor + folio referencia. */
export function partitionVentas(documents: SiiSalesDocument[]): VentasPartition {
  const invoiceMap = new Map<string, SiiSalesDocument>()

  for (const doc of documents) {
    if (!isNotaCreditoVenta(doc) && !isGuiaDespachoVenta(doc)) {
      invoiceMap.set(salesDocKey(doc.rut_receptor, doc.folio), doc)
    }
  }

  const notasCredito: NotaCreditoVentaGroup[] = []
  const facturaIdsEnNotas = new Set<string>()

  for (const doc of documents) {
    if (!isNotaCreditoVenta(doc)) continue
    const folioReferencia = extractFolioFacturaReferenciaVenta(doc.raw)
    const factura = folioReferencia
      ? (invoiceMap.get(salesDocKey(doc.rut_receptor, folioReferencia)) ?? null)
      : null
    if (factura) facturaIdsEnNotas.add(factura.id)
    notasCredito.push({ nota: doc, factura, folioReferencia })
  }

  const guiasDespacho = documents.filter(isGuiaDespachoVenta)

  const documentos = documents.filter(
    doc =>
      !isNotaCreditoVenta(doc) &&
      !isGuiaDespachoVenta(doc) &&
      !facturaIdsEnNotas.has(doc.id),
  )

  return { documentos, notasCredito, guiasDespacho, facturaIdsEnNotas }
}
