/**
 * Facturación de cotización: crea factura, PDF, y asigna series vendidas (pueden diferir de la reserva).
 */
import { supabase } from '@/lib/supabase'
import { uploadCompanyDocumentFiles } from '@/lib/companyDocumentsUpload'
import { insertInvoice, syncQuoteFollowupRemindersForStage } from '@/lib/commercialFollowupsQuery'
import { productTracksSerialStock } from '@/lib/productInventoryRules'
import type { InvoiceStatus, Product } from '@/types'

function isQuotesStageCheckError(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('quotes_stage_check') || (m.includes('check constraint') && m.includes('stage'))
}

async function fetchQuoteStage(quoteId: string): Promise<string> {
  const { data, error } = await supabase.from('quotes').select('stage').eq('id', quoteId).single()
  if (error) throw new Error(error.message)
  return (data?.stage as string | undefined) ?? 'borrador'
}

/**
 * Cierra la cotización como facturada.
 * Si el CHECK de Postgres aún no incluye `facturada`, usa `orden_de_venta` (legacy).
 */
export async function markQuoteAsInvoiced(quoteId: string): Promise<'facturada' | 'orden_de_venta'> {
  const closedAt = new Date().toISOString()
  const { error: e1 } = await supabase
    .from('quotes')
    .update({ stage: 'facturada', closed_at: closedAt })
    .eq('id', quoteId)
  if (!e1) return 'facturada'
  if (!isQuotesStageCheckError(e1.message)) throw new Error(e1.message)

  const { error: e2 } = await supabase
    .from('quotes')
    .update({ stage: 'orden_de_venta', closed_at: closedAt })
    .eq('id', quoteId)
  if (e2) throw new Error(e2.message)
  return 'orden_de_venta'
}

async function finalizeQuoteAfterInvoicing(quoteId: string): Promise<void> {
  const prevStage = await fetchQuoteStage(quoteId)
  const newStage = await markQuoteAsInvoiced(quoteId)
  await syncQuoteFollowupRemindersForStage(quoteId, prevStage, newStage)
}

export interface InvoiceStockLineInput {
  quoteItemId: string
  inventoryItemIds: string[]
  installedAddress?: string
  destinationNotes?: string
}

export interface CompleteQuoteInvoicingInput {
  quoteId: string
  companyId: string
  invoiceNumber: string
  invoiceStatus: InvoiceStatus
  quoteTotal: number
  quoteCurrency: string
  pdfFile: File
  stockLines: InvoiceStockLineInput[]
  /** Glosa / descripción en factura (columna `title`) */
  glosa?: string | null
  notes?: string | null
}

export type QuoteStockLineForInvoicing = {
  quoteItemId: string
  productId: string
  productName: string
  quantity: number
  assignedIds: string[]
  options: { id: string; serial_number: string; status: string }[]
}

/** Líneas stock con serie que requieren selección al facturar. */
export async function fetchQuoteStockLinesForInvoicing(
  quoteId: string,
): Promise<QuoteStockLineForInvoicing[]> {
  const { data: rows, error } = await supabase
    .from('quote_items')
    .select('id, product_id, product_name, quantity, line_kind')
    .eq('quote_id', quoteId)

  if (error) throw new Error(error.message)

  const stockRows = (rows ?? []).filter(r => r.line_kind === 'stock' && r.product_id)
  if (!stockRows.length) return []

  const productIds = [...new Set(stockRows.map(r => r.product_id as string))]
  const { data: prods, error: pe } = await supabase
    .from('products')
    .select('id, name, type, has_inventory')
    .in('id', productIds)
  if (pe) throw new Error(pe.message)

  const prodMap = new Map<string, Product>()
  for (const p of prods ?? []) prodMap.set(p.id as string, p as Product)

  const serialLines = stockRows.filter(r => {
    const p = prodMap.get(r.product_id as string)
    return p && productTracksSerialStock(p)
  })

  if (!serialLines.length) return []

  const quoteItemIds = serialLines.map(r => r.id as string)

  const { data: assigns } = await supabase
    .from('quote_item_serial_assignments')
    .select('quote_item_id, inventory_item_id, inventory_items(id, serial_number, status, product_id)')
    .in('quote_item_id', quoteItemIds)

  const assignedByLine = new Map<string, { id: string; serial_number: string; status: string }[]>()
  for (const a of assigns ?? []) {
    const qid = a.quote_item_id as string
    const invRaw = a.inventory_items as { id: string; serial_number: string; status: string } | { id: string; serial_number: string; status: string }[] | null
    const inv = Array.isArray(invRaw) ? invRaw[0] : invRaw
    if (!inv) continue
    if (!assignedByLine.has(qid)) assignedByLine.set(qid, [])
    assignedByLine.get(qid)!.push({
      id: inv.id,
      serial_number: inv.serial_number,
      status: inv.status,
    })
  }

  const { data: disponibles } = await supabase
    .from('inventory_items')
    .select('id, serial_number, status, product_id')
    .in('product_id', productIds)
    .eq('status', 'disponible')

  const disponiblesByProduct = new Map<string, { id: string; serial_number: string; status: string }[]>()
  for (const d of disponibles ?? []) {
    const pid = d.product_id as string
    if (!disponiblesByProduct.has(pid)) disponiblesByProduct.set(pid, [])
    disponiblesByProduct.get(pid)!.push({
      id: d.id as string,
      serial_number: d.serial_number as string,
      status: d.status as string,
    })
  }

  return serialLines.map(r => {
    const qid = r.id as string
    const pid = r.product_id as string
    const assigned = assignedByLine.get(qid) ?? []
    const assignedIds = new Set(assigned.map(x => x.id))
    const extra = (disponiblesByProduct.get(pid) ?? []).filter(x => !assignedIds.has(x.id))
    const options = [...assigned, ...extra].sort((a, b) =>
      a.serial_number.localeCompare(b.serial_number, 'es'),
    )
    return {
      quoteItemId: qid,
      productId: pid,
      productName: ((r.product_name as string) ?? '').trim() || prodMap.get(pid)?.name || 'Producto',
      quantity: Math.max(0, Math.floor(Number(r.quantity) || 0)),
      assignedIds: assigned.map(x => x.id),
      options,
    }
  })
}

export async function fetchInvoiceForQuote(quoteId: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error && error.code !== '42P01') throw new Error(error.message)
  return data ?? null
}

async function collectPriorReservedIds(quoteId: string): Promise<string[]> {
  const { data: qiRows } = await supabase.from('quote_items').select('id').eq('quote_id', quoteId)
  const qids = (qiRows ?? []).map(r => r.id as string)
  if (!qids.length) return []
  const { data: assigns } = await supabase
    .from('quote_item_serial_assignments')
    .select('inventory_item_id')
    .in('quote_item_id', qids)
  return [...new Set((assigns ?? []).map(a => a.inventory_item_id as string))]
}

/**
 * Crea factura, sube PDF, marca series como vendidas y cierra la cotización en `facturada`.
 */
export async function completeQuoteInvoicing(input: CompleteQuoteInvoicingInput): Promise<{ invoiceId: string }> {
  const {
    quoteId,
    companyId,
    invoiceNumber,
    invoiceStatus,
    quoteTotal,
    quoteCurrency,
    pdfFile,
    stockLines,
    glosa,
    notes,
  } = input

  const trimmedNumber = invoiceNumber.trim()
  if (!trimmedNumber) throw new Error('Ingrese el número de factura del SII.')

  const existingInv = await fetchInvoiceForQuote(quoteId)
  if (existingInv) {
    try {
      await finalizeQuoteAfterInvoicing(quoteId)
    } catch (stageErr) {
      throw new Error(
        `Ya existe una factura para esta cotización, pero no se pudo actualizar su etapa. ` +
          `Ejecute supabase/sql/quotes_stage_facturada_check.sql en Supabase. ` +
          `${(stageErr as Error).message}`,
      )
    }
    return { invoiceId: existingInv.id as string }
  }

  const lines = await fetchQuoteStockLinesForInvoicing(quoteId)
  const allSelectedIds = new Set(stockLines.flatMap(s => s.inventoryItemIds))

  for (const line of lines) {
    const sel = stockLines.find(s => s.quoteItemId === line.quoteItemId)
    const picked = sel?.inventoryItemIds ?? []
    if (picked.length !== line.quantity) {
      throw new Error(
        `«${line.productName}»: seleccione exactamente ${line.quantity} serie(s); tiene ${picked.length}.`,
      )
    }
    const allowed = new Set(line.options.map(o => o.id))
    for (const id of picked) {
      if (!allowed.has(id)) {
        throw new Error(`«${line.productName}»: la serie seleccionada no es válida para esta cotización.`)
      }
    }
  }

  const priorReservedIds = await collectPriorReservedIds(quoteId)

  const paidAt = invoiceStatus === 'pagada' ? new Date().toISOString() : null

  const invoice = await insertInvoice({
    company_id: companyId,
    quote_id: quoteId,
    invoice_number: trimmedNumber,
    title: glosa?.trim() || null,
    status: invoiceStatus,
    total: quoteTotal,
    currency: quoteCurrency,
  })

  const { error: valErr } = await supabase
    .from('invoices')
    .update({
      sii_validated_at: new Date().toISOString(),
      paid_at: paidAt,
      notes: notes?.trim() || null,
    })
    .eq('id', invoice.id)
  if (valErr) throw new Error(valErr.message)

  const upload = await uploadCompanyDocumentFiles(
    [pdfFile],
    companyId,
    'factura',
    quoteId,
    invoice.id,
  )
  if (upload.uploaded === 0) {
    const reason = upload.failures[0]?.reason ?? 'No se pudo subir el PDF de la factura.'
    throw new Error(reason)
  }

  const { data: qiRows } = await supabase.from('quote_items').select('id').eq('quote_id', quoteId)
  const qids = (qiRows ?? []).map(r => r.id as string)

  if (qids.length) {
    await supabase.from('quote_item_serial_assignments').delete().in('quote_item_id', qids)
  }

  for (const sl of stockLines) {
    if (!sl.inventoryItemIds.length) continue
    const dest = sl.destinationNotes?.trim() || null
    const addr = sl.installedAddress?.trim() || null
    await supabase
      .from('inventory_items')
      .update({
        status: 'vendido',
        custody: 'en_cliente',
        custody_company_id: companyId,
        destination_notes: dest,
        installed_address: addr,
      })
      .in('id', sl.inventoryItemIds)

    const rows = sl.inventoryItemIds.map(inventory_item_id => ({
      quote_item_id: sl.quoteItemId,
      inventory_item_id,
    }))
    const { error: insErr } = await supabase.from('quote_item_serial_assignments').insert(rows)
    if (insErr) throw new Error(insErr.message)
  }

  const releaseIds = priorReservedIds.filter(id => !allSelectedIds.has(id))
  if (releaseIds.length) {
    await supabase.from('inventory_items').update({ status: 'disponible' }).in('id', releaseIds)
  }

  try {
    await finalizeQuoteAfterInvoicing(quoteId)
  } catch (stageErr) {
    throw new Error(
      `La factura y el PDF se guardaron, pero no se pudo marcar la cotización como facturada. ` +
        `Ejecute supabase/sql/quotes_stage_facturada_check.sql en Supabase y pulse de nuevo «Validar y facturar» ` +
        `para completar la etapa (no se duplicará la factura). ` +
        `${(stageErr as Error).message}`,
    )
  }

  return { invoiceId: invoice.id }
}

/** Cotización sin líneas serial: solo factura + etapa. */
export async function completeQuoteInvoicingWithoutStock(
  input: Omit<CompleteQuoteInvoicingInput, 'stockLines'>,
): Promise<{ invoiceId: string }> {
  return completeQuoteInvoicing({ ...input, stockLines: [] })
}
