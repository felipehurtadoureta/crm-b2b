/**
 * Por producto: unidades pactadas desde stock (`line_kind stock`) menos seriales ya asignados,
 * solo en cotizaciones `aceptada` u `orden_de_venta`.
 *
 * Nota: un mismo producto puede figurar en varias cotizaciones en cierre; el total es la suma
 * de cada línea. Para depuración, `byQuote` desglosa el aporte por cotización.
 *
 * Las consultas `.in(...)` muy largas pueden fallar o truncarse; por eso trabajamos en lotes.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { productTracksSerialStock } from '@/lib/productInventoryRules'
import type { Product } from '@/types'

/** Aporte de una cotización cerrada al faltante de un modelo. */
export type FabricacionQuoteSlice = {
  quoteId: string
  quoteNumber: string
  qtyPendiente: number
}

export type FabricacionRow = {
  productId: string
  productName: string
  qtyPendiente: number
  /** Desglose por cotización cuando hay pendiente → ver de dónde sale el número. */
  byQuote?: FabricacionQuoteSlice[]
}

const STAGES_CIERRE = ['aceptada', 'orden_de_venta'] as const

/** Particiona arrays para `.in(...)` sin exceder límites prácticos de URL / PostgREST. */
function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size) as T[])
  return out
}

type StockLineDb = {
  id: string
  product_id: string | null
  product_name: string | null
  quantity: number | string | null
  quote_id: string
}

async function computeFabricacionPendiente(): Promise<FabricacionRow[]> {
  const { data: openQuotes, error: qErr } = await supabase
    .from('quotes')
    .select('id, quote_number')
    .in('stage', [...STAGES_CIERRE])

  if (qErr) throw qErr

  const quoteIds = (openQuotes ?? []).map(r => r.id as string)
  if (!quoteIds.length) return []

  const quoteNumberById = new Map<string, string>()
  for (const q of openQuotes ?? []) quoteNumberById.set(q.id as string, ((q.quote_number as string) ?? '').trim())

  const stockLines: StockLineDb[] = []
  for (const qChunk of chunk(quoteIds, 40)) {
    const { data: lines, error: lErr } = await supabase
      .from('quote_items')
      .select('id, product_id, product_name, quantity, quote_id')
      .in('quote_id', qChunk)
      .eq('line_kind', 'stock')
    if (lErr) throw lErr
    for (const l of lines ?? []) stockLines.push(l as StockLineDb)
  }

  const withPid = stockLines.filter(l => l.product_id?.length)
  if (!withPid.length) return []

  const prodIds = [...new Set(withPid.map(l => l.product_id as string))]

  /** Productos cargados también en lotes (por si hay muchos UUID en un solo `.in`). */
  const prodRows: Record<string, unknown>[] = []
  for (const pChunk of chunk(prodIds, 120)) {
    const { data: pr, error: pe } = await supabase.from('products').select('id, name, type, has_inventory').in('id', pChunk)
    if (pe) throw pe
    prodRows.push(...(pr ?? []))
  }

  const prodMap = new Map(prodRows.map(pr => [pr.id as string, pr as unknown as Product]))

  const trackedLines = withPid.filter(l => {
    const p = prodMap.get(l.product_id as string)
    return !!(p && productTracksSerialStock(p))
  })
  if (!trackedLines.length) return []

  const lineIds = trackedLines.map(l => l.id)
  const countByLine = new Map<string, number>()
  for (const id of lineIds) countByLine.set(id, 0)

  for (const lnChunk of chunk(lineIds, 120)) {
    const { data: assigns, error: aErr } = await supabase
      .from('quote_item_serial_assignments')
      .select('quote_item_id')
      .in('quote_item_id', lnChunk)
    if (aErr) throw aErr
    for (const a of assigns ?? []) {
      const qid = (a as { quote_item_id: string }).quote_item_id
      countByLine.set(qid, (countByLine.get(qid) ?? 0) + 1)
    }
  }

  type Agg = {
    displayName: string
    total: number
    byQuote: Map<string, FabricacionQuoteSlice>
  }
  const byProduct = new Map<string, Agg>()

  for (const row of trackedLines) {
    const pid = row.product_id as string
    const p = prodMap.get(pid)!
    const desired = Math.max(0, Math.floor(Number(row.quantity) || 0))
    const asignadas = countByLine.get(row.id) ?? 0
    const pendiente = Math.max(0, desired - asignadas)
    const lineLabel = row.product_name?.trim() || p.name

    if (!byProduct.has(pid)) {
      byProduct.set(pid, { displayName: lineLabel, total: 0, byQuote: new Map() })
    }
    const agg = byProduct.get(pid)!
    if (lineLabel) agg.displayName = lineLabel

    agg.total += pendiente
    if (pendiente <= 0) continue

    const qid = row.quote_id
    const qn = quoteNumberById.get(qid)?.trim() || qid.slice(0, 8)
    const prev = agg.byQuote.get(qid)
    if (prev) prev.qtyPendiente += pendiente
    else agg.byQuote.set(qid, { quoteId: qid, quoteNumber: qn, qtyPendiente: pendiente })
  }

  return [...byProduct.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([productId, v]) => ({
      productId,
      productName: v.displayName || productId,
      qtyPendiente: v.total,
      byQuote: [...v.byQuote.values()].sort((a, b) => {
        const an = String(a.quoteNumber)
        const bn = String(b.quoteNumber)
        return an.localeCompare(bn, 'es', { numeric: true })
      }),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName, 'es'))
}

/** Mapa rápido id producto → unidades pendientes de fabricación */
export async function fabricationDemandByProductId(): Promise<Record<string, number>> {
  const rows = await computeFabricacionPendiente()
  const map: Record<string, number> = {}
  for (const r of rows) map[r.productId] = r.qtyPendiente
  return map
}

export function useFabricacionPendiente(opts: { enabled: boolean }) {
  return useQuery({
    queryKey: ['fabricacion-pendiente-cotizaciones'],
    queryFn: computeFabricacionPendiente,
    enabled: opts.enabled,
    staleTime: 30_000,
  })
}
