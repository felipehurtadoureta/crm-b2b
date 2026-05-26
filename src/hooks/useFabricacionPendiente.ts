/**
 * Demanda de fabricación/abastecimiento en cotizaciones aceptadas (líneas `procure`).
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type FabricacionQuoteSlice = {
  quoteId: string
  quoteNumber: string
  qtyPendiente: number
}

export type FabricacionRow = {
  productId: string
  productName: string
  qtyPendiente: number
  byQuote?: FabricacionQuoteSlice[]
}

const STAGES_CIERRE = ['aceptada'] as const

function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size) as T[])
  return out
}

type ProcureLineDb = {
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
  for (const q of openQuotes ?? []) {
    quoteNumberById.set(q.id as string, ((q.quote_number as string) ?? '').trim())
  }

  const procureLines: ProcureLineDb[] = []
  for (const qChunk of chunk(quoteIds, 40)) {
    const { data: lines, error: lErr } = await supabase
      .from('quote_items')
      .select('product_id, product_name, quantity, quote_id')
      .in('quote_id', qChunk)
      .eq('line_kind', 'procure')
    if (lErr) throw lErr
    for (const l of lines ?? []) procureLines.push(l as ProcureLineDb)
  }

  type Agg = {
    displayName: string
    total: number
    byQuote: Map<string, FabricacionQuoteSlice>
  }
  const byProduct = new Map<string, Agg>()

  for (const row of procureLines) {
    const pid = row.product_id as string | null
    if (!pid) continue
    const qty = Math.max(0, Math.floor(Number(row.quantity) || 0))
    if (qty <= 0) continue

    const lineLabel = row.product_name?.trim() || pid
    if (!byProduct.has(pid)) {
      byProduct.set(pid, { displayName: lineLabel, total: 0, byQuote: new Map() })
    }
    const agg = byProduct.get(pid)!
    if (lineLabel) agg.displayName = lineLabel
    agg.total += qty

    const qid = row.quote_id
    const qn = quoteNumberById.get(qid)?.trim() || qid.slice(0, 8)
    const prev = agg.byQuote.get(qid)
    if (prev) prev.qtyPendiente += qty
    else agg.byQuote.set(qid, { quoteId: qid, quoteNumber: qn, qtyPendiente: qty })
  }

  return [...byProduct.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([productId, v]) => ({
      productId,
      productName: v.displayName || productId,
      qtyPendiente: v.total,
      byQuote: [...v.byQuote.values()].sort((a, b) =>
        String(a.quoteNumber).localeCompare(String(b.quoteNumber), 'es', { numeric: true }),
      ),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName, 'es'))
}

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
