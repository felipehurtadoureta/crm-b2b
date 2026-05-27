/**
 * Filtrado y orden del listado al vincular facturas SII desde el libro de banco.
 */
import { partitionCompras } from '@/lib/siiPurchaseSubtabs'
import { partitionVentas } from '@/lib/siiSalesSubtabs'
import type { SiiPurchaseDocument, SiiSalesDocument } from '@/types'

export type BankLinkSearchOpts = {
  search?: string
  /** Monto del movimiento (cargo FC o abono FV). */
  amount?: number
  limit?: number
}

/** Solo facturas vinculables: sin NC, guías ni facturas con NC asociada. */
export function filterPurchasesForBankLink(docs: SiiPurchaseDocument[]): SiiPurchaseDocument[] {
  return partitionCompras(docs).documentos
}

export function filterSalesForBankLink(docs: SiiSalesDocument[]): SiiSalesDocument[] {
  return partitionVentas(docs).documentos
}

export function sortForBankLink<T extends { monto_total: number; fecha_emision: string }>(
  docs: T[],
  amount: number,
): T[] {
  const target = Math.round(Math.max(0, amount))
  if (target <= 0) {
    return [...docs].sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision))
  }
  return [...docs].sort((a, b) => {
    const diffA = Math.abs(Math.round(Number(a.monto_total)) - target)
    const diffB = Math.abs(Math.round(Number(b.monto_total)) - target)
    if (diffA !== diffB) return diffA - diffB
    return b.fecha_emision.localeCompare(a.fecha_emision)
  })
}

function matchesSearchTerm(
  term: string,
  fields: { folio: string; rut: string; name: string; monto_total: number },
): boolean {
  const lower = term.toLowerCase()
  const digits = term.replace(/\D/g, '')
  return (
    fields.folio.toLowerCase().includes(lower) ||
    fields.rut.toLowerCase().includes(lower) ||
    fields.name.toLowerCase().includes(lower) ||
    (digits.length >= 2 && String(Math.round(fields.monto_total)).includes(digits))
  )
}

export function finalizeBankLinkList<T extends { monto_total: number; fecha_emision: string }>(
  docs: T[],
  opts: BankLinkSearchOpts,
  matchFields: (doc: T) => { folio: string; rut: string; name: string; monto_total: number },
): T[] {
  const limit = opts.limit ?? 30
  const term = opts.search?.trim() ?? ''
  let rows = docs

  if (term) {
    rows = rows.filter(doc => matchesSearchTerm(term, matchFields(doc)))
  }

  return sortForBankLink(rows, opts.amount ?? 0).slice(0, limit)
}
