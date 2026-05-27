/**
 * Vincula una cotización con una factura importada desde SII (RCV Ventas).
 */
import { supabase } from '@/lib/supabase'
import {
  ensureInvoiceForSiiSalesDoc,
  fetchSiiSalesDocumentsForCompany,
  syncQuoteFollowupRemindersForStage,
} from '@/lib/commercialFollowupsQuery'
import { fetchSiiSalesCollectedTotals } from '@/lib/bankSiiSalesLink'
import { fetchInvoiceForQuote } from '@/lib/quoteInvoiceFulfillment'
import { normalizeFolio } from '@/lib/siiPurchaseSubtabs'
import { normalizeQuoteStage, quoteKanbanStage, type SiiSalesDocument } from '@/types'

export { fetchSiiSalesDocumentsForCompany as fetchSiiSalesInvoicesForQuoteLink }

function isQuotesStageCheckError(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('quotes_stage_check') || (m.includes('check constraint') && m.includes('stage'))
}

/** Marca la cotización como pendiente de vincular factura SII. */
export async function markQuoteAsPendingInvoice(
  quoteId: string,
  previousStage: string,
): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({ stage: 'pendiente_facturar', closed_at: null })
    .eq('id', quoteId)
  if (error) {
    if (isQuotesStageCheckError(error.message)) {
      throw new Error(
        'Falta habilitar la etapa "pendiente_facturar" en Supabase. ' +
          'Ejecute el SQL: supabase/sql/quotes_pendiente_facturar_stage.sql',
      )
    }
    throw new Error(error.message)
  }
  await syncQuoteFollowupRemindersForStage(quoteId, previousStage, 'pendiente_facturar')
}

const QUOTE_STAGE_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  en_negociacion: 'En negociación',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  pendiente_facturar: 'Pendiente de facturar',
  rechazada: 'Rechazada',
  facturada: 'Facturada',
}

export type QuotePendingInvoiceUiStatus =
  | 'sin_factura'
  | 'vinculada_sin_cerrar'
  | 'cerrada'

export interface QuoteInvoiceLinkSummary {
  invoice_number: string
  sii_sales_document_id: string | null
}

/** Estado de facturación SII para cotizaciones en pendiente_facturar. */
export function getQuotePendingInvoiceUiStatus(
  quote: { stage: string; closed_at?: string | null },
  invoice?: QuoteInvoiceLinkSummary | null,
): QuotePendingInvoiceUiStatus | null {
  if (quoteKanbanStage(quote.stage) !== 'pendiente_facturar') return null
  if (isQuotePendingInvoiceClosed(quote)) return 'cerrada'
  if (invoice?.invoice_number?.trim()) return 'vinculada_sin_cerrar'
  return 'sin_factura'
}

/** Texto y color para tarjeta Kanban / listados. */
export function quotePendingInvoiceBadge(
  quote: { stage: string; closed_at?: string | null },
  invoice?: QuoteInvoiceLinkSummary | null,
): { label: string; className: string } | null {
  const status = getQuotePendingInvoiceUiStatus(quote, invoice)
  if (!status) return null
  const folio = invoice?.invoice_number?.trim()
  switch (status) {
    case 'sin_factura':
      return { label: 'Sin factura SII', className: 'text-amber-700' }
    case 'vinculada_sin_cerrar':
      return {
        label: folio ? `Factura ${folio} · falta cerrar` : 'Factura vinculada · falta cerrar',
        className: 'text-violet-700',
      }
    case 'cerrada':
      return {
        label: folio ? `Factura ${folio} · cerrada` : 'Factura SII · cerrada',
        className: 'text-teal-700',
      }
  }
}

/** Facturas vinculadas por cotización (para Kanban). */
export async function fetchInvoiceLinksByQuoteIds(
  quoteIds: string[],
): Promise<Map<string, QuoteInvoiceLinkSummary>> {
  const map = new Map<string, QuoteInvoiceLinkSummary>()
  if (!quoteIds.length) return map

  const { data, error } = await supabase
    .from('invoices')
    .select('quote_id, invoice_number, sii_sales_document_id, created_at')
    .in('quote_id', quoteIds)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return map
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    const qid = row.quote_id as string | null
    if (!qid || map.has(qid)) continue
    const num = (row.invoice_number as string | undefined)?.trim()
    if (!num) continue
    map.set(qid, {
      invoice_number: num,
      sii_sales_document_id: (row.sii_sales_document_id as string | null) ?? null,
    })
  }
  return map
}

/** Etiqueta visible de etapa en listados. */
export function quoteStageDisplayLabel(
  quote: { stage: string; closed_at?: string | null },
  invoice?: QuoteInvoiceLinkSummary | null,
): string {
  const badge = quotePendingInvoiceBadge(quote, invoice)
  if (badge) return badge.label
  const s = quoteKanbanStage(quote.stage)
  return QUOTE_STAGE_LABEL[s] ?? s
}

/** Cotización cerrada con factura SII (pendiente_facturar + closed_at, o legacy facturada). */
export function isQuotePendingInvoiceClosed(quote: {
  stage: string
  closed_at?: string | null
}): boolean {
  const s = normalizeQuoteStage(quote.stage)
  if (s === 'facturada') return true
  return s === 'pendiente_facturar' && !!quote.closed_at
}

/** Cierra el registro en etapa facturada tras vincular factura SII. */
export async function closeQuoteAfterSiiInvoiceLink(
  quoteId: string,
  previousStage: string,
): Promise<void> {
  const closedAt = new Date().toISOString()
  const { error } = await supabase
    .from('quotes')
    .update({ stage: 'facturada', closed_at: closedAt })
    .eq('id', quoteId)
  if (error) {
    if (isQuotesStageCheckError(error.message)) {
      throw new Error(
        'Falta habilitar la etapa "facturada" en Supabase. ' +
          'Ejecute el SQL: supabase/sql/quotes_stage_facturada_check.sql',
      )
    }
    throw new Error(error.message)
  }
  await closeQuoteFollowupAfterInvoiceLink(quoteId)
  if (previousStage !== 'facturada') {
    await syncQuoteFollowupRemindersForStage(quoteId, previousStage, 'facturada')
  }
}

/** Cancela recordatorios abiertos de seguimiento en cotización tras vincular factura. */
export async function closeQuoteFollowupAfterInvoiceLink(quoteId: string): Promise<void> {
  const { error } = await supabase
    .from('commercial_followup_reminders')
    .update({
      status: 'cancelled',
      closed_at: new Date().toISOString(),
      closed_reason: 'quote_closed',
      updated_at: new Date().toISOString(),
    })
    .eq('quote_id', quoteId)
    .eq('subject_type', 'quote')
    .eq('status', 'open')

  if (error && error.code !== '42P01') {
    throw new Error(error.message)
  }
}

async function resolveSiiSalesDocument(
  companyId: string,
  siiSalesDocumentId?: string,
  folio?: string,
): Promise<SiiSalesDocument> {
  const docs = await fetchSiiSalesDocumentsForCompany(companyId)
  if (siiSalesDocumentId) {
    const doc = docs.find(d => d.id === siiSalesDocumentId)
    if (!doc) throw new Error('La factura SII seleccionada no está disponible para esta empresa.')
    return doc
  }

  const trimmed = folio?.trim()
  if (!trimmed) throw new Error('Seleccione o ingrese el número de factura SII.')

  const normalized = normalizeFolio(trimmed)
  const matches = docs.filter(d => normalizeFolio(d.folio) === normalized)
  if (matches.length === 0) {
    throw new Error(
      `No se encontró factura SII con folio «${trimmed}» para esta empresa. ` +
        'Verifique que esté importada en SII → Ventas.',
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `Hay más de una factura SII con folio «${trimmed}». Selecciónela de la lista.`,
    )
  }
  return matches[0]
}

async function assertInvoiceNotLinkedToOtherQuote(
  siiSalesDocumentId: string,
  quoteId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, quote_id')
    .eq('sii_sales_document_id', siiSalesDocumentId)
    .maybeSingle()

  if (error && error.code !== '42703' && error.code !== 'PGRST116') {
    throw new Error(error.message)
  }

  const linkedQuoteId = data?.quote_id as string | null | undefined
  if (linkedQuoteId && linkedQuoteId !== quoteId) {
    throw new Error('Esta factura SII ya está vinculada a otra cotización.')
  }
}

/** IDs de facturas SII ya vinculadas a otra cotización (para filtrar el selector). */
export async function fetchSiiDocIdsLinkedToOtherQuotes(
  companyId: string,
  quoteId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('invoices')
    .select('sii_sales_document_id, quote_id')
    .eq('company_id', companyId)
    .not('quote_id', 'is', null)

  if (error) {
    if (error.code === '42703' || error.code === '42P01') return new Set()
    throw new Error(error.message)
  }

  const blocked = new Set<string>()
  for (const row of data ?? []) {
    const docId = row.sii_sales_document_id as string | null
    const qid = row.quote_id as string | null
    if (docId && qid && qid !== quoteId) blocked.add(docId)
  }
  return blocked
}

export interface LinkQuoteToSiiInvoiceInput {
  quoteId: string
  companyId: string
  quoteTotal: number
  quoteCurrency: string
  previousStage: string
  siiSalesDocumentId?: string
  folio?: string
}

/** Vincula factura SII a la cotización y cierra el registro (permanece en pendiente_facturar). */
export async function linkQuoteToSiiSalesInvoice(
  input: LinkQuoteToSiiInvoiceInput,
): Promise<{ invoiceId: string }> {
  const {
    quoteId,
    companyId,
    quoteTotal,
    quoteCurrency,
    previousStage,
    siiSalesDocumentId,
    folio,
  } = input

  const existingInv = await fetchInvoiceForQuote(quoteId)
  if (existingInv?.sii_sales_document_id) {
    await closeQuoteAfterSiiInvoiceLink(quoteId, previousStage)
    return { invoiceId: existingInv.id as string }
  }

  const doc = await resolveSiiSalesDocument(companyId, siiSalesDocumentId, folio)
  await assertInvoiceNotLinkedToOtherQuote(doc.id, quoteId)

  const collectedMap = await fetchSiiSalesCollectedTotals([doc.id])
  const invoice = await ensureInvoiceForSiiSalesDoc(
    companyId,
    doc,
    collectedMap.get(doc.id) ?? 0,
  )
  if (!invoice) throw new Error('No se pudo registrar la factura SII para seguimiento.')

  const { error: linkErr } = await supabase
    .from('invoices')
    .update({
      quote_id: quoteId,
      invoice_number: doc.folio,
      total: quoteTotal,
      currency: quoteCurrency,
      sii_validated_at: new Date().toISOString(),
      notes: `Vinculada a cotización desde SII (folio ${doc.folio}).`,
    })
    .eq('id', invoice.id)

  if (linkErr) throw new Error(linkErr.message)

  await closeQuoteAfterSiiInvoiceLink(quoteId, previousStage)

  return { invoiceId: invoice.id }
}

/** Cambia la factura SII vinculada a una cotización ya facturada (o pendiente con vínculo previo). */
export async function relinkQuoteToSiiSalesInvoice(
  input: LinkQuoteToSiiInvoiceInput,
): Promise<{ invoiceId: string }> {
  const { quoteId, companyId, quoteTotal, quoteCurrency, previousStage, siiSalesDocumentId, folio } =
    input

  const doc = await resolveSiiSalesDocument(companyId, siiSalesDocumentId, folio)
  await assertInvoiceNotLinkedToOtherQuote(doc.id, quoteId)

  const existingInv = await fetchInvoiceForQuote(quoteId)
  const collectedMap = await fetchSiiSalesCollectedTotals([doc.id])

  const patch = {
    quote_id: quoteId,
    invoice_number: doc.folio,
    total: quoteTotal,
    currency: quoteCurrency,
    sii_sales_document_id: doc.id,
    sii_validated_at: new Date().toISOString(),
    notes: `Vinculada a cotización desde SII (folio ${doc.folio}).`,
  }

  if (existingInv?.id) {
    if (
      existingInv.sii_sales_document_id &&
      existingInv.sii_sales_document_id !== doc.id
    ) {
      await supabase
        .from('invoices')
        .update({
          quote_id: null,
          notes: 'Desvinculada al reasignar factura SII en cotización.',
        })
        .eq('id', existingInv.id)
    } else {
      const { error: upErr } = await supabase.from('invoices').update(patch).eq('id', existingInv.id)
      if (upErr) throw new Error(upErr.message)
      await closeQuoteAfterSiiInvoiceLink(quoteId, previousStage)
      return { invoiceId: existingInv.id as string }
    }
  }

  const invoice = await ensureInvoiceForSiiSalesDoc(
    companyId,
    doc,
    collectedMap.get(doc.id) ?? 0,
  )
  if (!invoice) throw new Error('No se pudo registrar la factura SII para seguimiento.')

  const { error: linkErr } = await supabase.from('invoices').update(patch).eq('id', invoice.id)
  if (linkErr) throw new Error(linkErr.message)

  await closeQuoteAfterSiiInvoiceLink(quoteId, previousStage)
  return { invoiceId: invoice.id }
}
