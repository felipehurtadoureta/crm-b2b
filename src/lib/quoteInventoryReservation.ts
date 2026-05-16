/**
 * Reserva / libera números de serie en inventario según cotización aceptada u orden de venta.
 *
 * Etapas que mantienen reserva: `aceptada`, `orden_de_venta`.
 * Al salir de esas etapas o al borrar cotización, los ítems vuelven a `disponible` si estaban `reservado`.
 */
import { supabase } from '@/lib/supabase'
import { productTracksSerialStock } from '@/lib/productInventoryRules'
import type { Product, QuoteStage } from '@/types'

export const QUOTE_RESERVE_INVENTORY_STAGES: ReadonlySet<QuoteStage> = new Set([
  'aceptada',
  'orden_de_venta',
])

export type ReservationApplyResult = { ok: boolean; messages: string[] }

/** Libera asignaciones y devuelve a `disponible` ítems reservados para esta cotización. */
export async function releaseReservationsForQuote(quoteId: string): Promise<void> {
  const { data: qiRows, error: qiErr } = await supabase.from('quote_items').select('id').eq('quote_id', quoteId)
  if (qiErr || !qiRows?.length) return

  const qids = qiRows.map(r => r.id as string)

  const { data: assigns } = await supabase
    .from('quote_item_serial_assignments')
    .select('inventory_item_id')
    .in('quote_item_id', qids)

  await supabase.from('quote_item_serial_assignments').delete().in('quote_item_id', qids)

  const invIds = [...new Set(assigns?.map(a => a.inventory_item_id as string) ?? [])]
  /** Sin filtrar por status previo: si el update con `.eq('reservado')` no aplica (RLS, dato raro), quedan unidades
   *  `reservado` sin fila de asignación y al re-guardar la cotización la cola ve 0 `disponible` y duplica el faltante. */
  if (invIds.length) {
    await supabase.from('inventory_items').update({ status: 'disponible' }).in('id', invIds)
  }
}

/** Quita filas de asignación hasta alcanzar `desired`; las más nuevas primero (LIFO). */
async function releaseExcessAssignmentsForLine(quoteItemId: string, desired: number): Promise<void> {
  const { data: assigns } = await supabase
    .from('quote_item_serial_assignments')
    .select('id, inventory_item_id, created_at')
    .eq('quote_item_id', quoteItemId)
    .order('created_at', { ascending: false })

  const total = assigns?.length ?? 0
  const excess = total - Math.max(0, desired)
  if (excess <= 0 || !assigns) return

  const victims = assigns.slice(0, excess)
  const victimRowIds = victims.map(a => a.id as string)
  const victimInvIds = [...new Set(victims.map(a => a.inventory_item_id as string))]
  if (victimRowIds.length) {
    await supabase.from('quote_item_serial_assignments').delete().in('id', victimRowIds)
  }
  if (victimInvIds.length) {
    await supabase.from('inventory_items').update({ status: 'disponible' }).in('id', victimInvIds)
  }
}

/**
 * Reconstruye colas FIFO de ids `disponible` por producto (solo productos físicos serializados).
 */
async function buildDisponiblesQueues(serialProductIds: string[]): Promise<{ queues: Map<string, string[]>; error?: string }> {
  const queues = new Map<string, string[]>()
  if (!serialProductIds.length) return { queues }
  for (const pid of serialProductIds) queues.set(pid, [])

  const { data: invRows, error: iErr } = await supabase
    .from('inventory_items')
    .select('id, product_id, created_at')
    .in('product_id', serialProductIds)
    .eq('status', 'disponible')
    .order('created_at', { ascending: true })

  if (iErr) return { queues, error: iErr.message }

  for (const ir of invRows ?? []) {
    const pid = ir.product_id as string
    if (!queues.has(pid)) continue
    queues.get(pid)!.push(ir.id as string)
  }
  return { queues }
}

/**
 * Para cada línea `stock` con producto físico serializado: reconcilia y reserva con cola global por producto.
 */
export async function applyReservationsForQuote(quoteId: string): Promise<ReservationApplyResult> {
  const messages: string[] = []

  const { data: rows, error } = await supabase
    .from('quote_items')
    .select('id, product_id, product_name, quantity, line_kind')
    .eq('quote_id', quoteId)

  if (error) return { ok: false, messages: [error.message] }

  const list = rows ?? []
  const productIdsAll = [...new Set(list.map(r => r.product_id).filter(Boolean) as string[])]

  const prodMap = new Map<string, Product>()
  if (productIdsAll.length) {
    const { data: prods, error: pe } = await supabase
      .from('products')
      .select('id, name, type, has_inventory')
      .in('id', productIdsAll)
    if (pe) return { ok: false, messages: [pe.message] }
    for (const p of prods ?? []) prodMap.set(p.id as string, p as Product)
  }

  const stockCandidateLines = list.filter(r => r.line_kind === 'stock' && r.product_id)

  const stockLines = stockCandidateLines.filter(r => {
    const p = prodMap.get(r.product_id as string)
    return !!(p && productTracksSerialStock(p))
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)))

  let hardError = false

  /** 1) Liberar excedentes de cada línea (tras bajar cantidad en la cotización). */
  for (const r of stockLines) {
    const desired = Math.max(0, Math.floor(Number(r.quantity) || 0))
    await releaseExcessAssignmentsForLine(r.id as string, desired)
  }

  /** 2) Cola global por modelo: así varias líneas del mismo producto consumen bien el mismo pool */
  const serialPids = [...new Set(stockLines.map(r => r.product_id as string))]
  const { queues, error: qErr } = await buildDisponiblesQueues(serialPids)
  if (qErr) {
    hardError = true
    messages.push(`No se pudo leer equipos disponibles: ${qErr}`)
    return { ok: false, messages }
  }

  for (const r of stockLines) {
    const lineLabel = ((r.product_name as string) ?? '').trim() || prodMap.get(r.product_id as string)?.name || 'Producto'
    const pid = r.product_id as string
    const desired = Math.max(0, Math.floor(Number(r.quantity) || 0))
    const quoteItemId = r.id as string

    const { data: curr } = await supabase.from('quote_item_serial_assignments').select('id').eq('quote_item_id', quoteItemId)

    const have = curr?.length ?? 0
    const need = desired - have
    if (need <= 0) continue

    const queue = queues.get(pid) ?? []
    const pickedIds: string[] = []
    for (let k = 0; k < need; k++) {
      const invId = queue.shift()
      if (!invId) break
      pickedIds.push(invId)
    }

    let picked = 0
    if (pickedIds.length > 0) {
      const { data: updated, error: uErr } = await supabase
        .from('inventory_items')
        .update({ status: 'reservado' })
        .in('id', pickedIds)
        .eq('status', 'disponible')
        .select('id')

      if (uErr) {
        hardError = true
        messages.push(`«${lineLabel}»: no se pudieron reservar equipos (${uErr.message}).`)
        queue.unshift(...pickedIds.reverse())
      } else {
        const ok = new Set((updated ?? []).map(r => r.id as string))
        const failed = pickedIds.filter(id => !ok.has(id))
        if (failed.length) {
          queue.unshift(...failed.reverse())
        }
        const okIds = pickedIds.filter(id => ok.has(id))
        if (okIds.length > 0) {
          const rows = okIds.map(inventory_item_id => ({ quote_item_id: quoteItemId, inventory_item_id }))
          const { error: aErr } = await supabase.from('quote_item_serial_assignments').insert(rows)
          if (aErr) {
            hardError = true
            messages.push(`«${lineLabel}»: error guardando asignaciones (${aErr.message}).`)
            await supabase.from('inventory_items').update({ status: 'disponible' }).in('id', okIds)
            queue.unshift(...okIds.reverse())
          } else {
            picked = okIds.length
          }
        }
      }
    }

    const shortfall = need - picked
    if (shortfall > 0) {
      messages.push(
        `«${lineLabel}»: se reservaron ${picked} de ${need} unidades disponibles desde bodega. ` +
          `Faltan ${shortfall} para cumplir la línea — constan como pendientes de fabricación/abastecimiento en Inventario.`,
      )
    }
  }

  return { ok: !hardError, messages }
}

/**
 * Actualiza inventario ante cambio solo de etapa (p. ej. tablero de cotizaciones).
 */
export async function syncQuoteInventoryForStage(
  quoteId: string,
  newStage: QuoteStage,
  previousStage: QuoteStage | null | undefined,
): Promise<{ messages: string[] }> {
  const nowR = QUOTE_RESERVE_INVENTORY_STAGES.has(newStage)
  const prevR = previousStage != null ? QUOTE_RESERVE_INVENTORY_STAGES.has(previousStage) : false

  if (nowR) {
    const { messages } = await applyReservationsForQuote(quoteId)
    return { messages }
  }
  if (prevR && !nowR) {
    await releaseReservationsForQuote(quoteId)
    return { messages: ['Inventario: reservas liberadas por cambio de etapa.'] }
  }
  return { messages: [] }
}
