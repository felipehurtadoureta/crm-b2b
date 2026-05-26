/**
 * Seguimientos comerciales + recordatorios (Supabase).
 */
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  normalizeQuoteStage,
  QUOTE_FOLLOWUP_CLOSED_STAGES,
} from '@/types'
import type {
  CommercialFollowup,
  CommercialFollowupImportance,
  CommercialFollowupNextChannel,
  CommercialFollowupReminder,
  CommercialFollowupSubject,
  Invoice,
  InvoiceStatus,
} from '@/types'

export const COMMERCIAL_NEXT_CHANNEL_LABEL: Record<CommercialFollowupNextChannel, string> = {
  reunion: 'Reunión',
  mail: 'Mail',
  llamado: 'Llamado',
}

export function normalizeNextChannel(v: unknown): CommercialFollowupNextChannel | null {
  return v === 'reunion' || v === 'mail' || v === 'llamado' ? v : null
}

export function labelCommercialNextChannel(k: CommercialFollowupNextChannel | null | undefined): string {
  if (k === 'reunion' || k === 'mail' || k === 'llamado') return COMMERCIAL_NEXT_CHANNEL_LABEL[k]
  return COMMERCIAL_NEXT_CHANNEL_LABEL.llamado
}

/** Título del ítem en agenda para un recordatorio de seguimiento comercial. */
export function buildFollowupAgendaTitulo(
  channel: CommercialFollowupNextChannel | null | undefined,
  subjectType: CommercialFollowupSubject,
  opts: { quoteNumber?: string | null; invoiceNumber?: string | null } = {},
): string {
  const ch = labelCommercialNextChannel(channel)
  if (subjectType === 'quote') {
    const qn = opts.quoteNumber?.trim() ?? ''
    return `${ch} · Seguimiento · Cotización${qn ? ` ${qn}` : ''}`.trim()
  }
  if (subjectType === 'invoice') {
    const inn = opts.invoiceNumber?.trim() ?? ''
    return `${ch} · Seguimiento · Factura${inn ? ` ${inn}` : ''}`.trim()
  }
  return `${ch} · Seguimiento · Llamados`
}

function normalizeImportance(v: unknown): CommercialFollowupImportance {
  return v === 'baja' || v === 'media' || v === 'alta' ? v : 'media'
}

function mapFollowupRow(row: CommercialFollowup): CommercialFollowup {
  const r = row as CommercialFollowup & { next_follow_up_kind?: unknown }
  return {
    ...row,
    importance: normalizeImportance(r.importance),
    next_follow_up_kind: normalizeNextChannel(r.next_follow_up_kind),
  }
}

function mapReminderRow(row: CommercialFollowupReminder): CommercialFollowupReminder {
  const r = row as CommercialFollowupReminder & { next_follow_up_kind?: unknown }
  return {
    ...row,
    importance: normalizeImportance(r.importance),
    next_follow_up_kind: normalizeNextChannel(r.next_follow_up_kind),
  }
}

export const COMMERCIAL_FOLLOWUPS_SETUP_HINT =
  'Faltan las tablas en Supabase. Ejecute supabase/sql/commercial_followups.sql en el SQL Editor.'

/** Cuando PostgREST aún no ve la columna `importance` tras migrar. */
export const COMMERCIAL_FOLLOWUPS_IMPORTANCE_MIGRATION_HINT =
  'Ejecute supabase/sql/commercial_followups_importance.sql en el SQL Editor de Supabase. Si ya lo ejecutó, espere 1–2 minutos o vaya a Settings → API y recargue el proyecto para refrescar la caché del esquema.'

export const COMMERCIAL_FOLLOWUPS_NEXT_CHANNEL_MIGRATION_HINT =
  'Ejecute supabase/sql/commercial_followups_next_channel.sql en el SQL Editor de Supabase. Si ya lo ejecutó, espere 1–2 minutos o recargue la caché del esquema en Settings → API.'

export function isMissingImportanceColumnMessage(msg: string | undefined): boolean {
  if (!msg) return false
  const m = msg.toLowerCase()
  return (
    m.includes('importance') &&
    (m.includes('schema cache') || m.includes('could not find') || m.includes('column') || m.includes('does not exist'))
  )
}

export function isMissingNextChannelColumnMessage(msg: string | undefined): boolean {
  if (!msg) return false
  const m = msg.toLowerCase()
  return (
    m.includes('next_follow_up_kind') &&
    (m.includes('schema cache') || m.includes('could not find') || m.includes('column') || m.includes('does not exist'))
  )
}

export function isCommercialFollowupsSchemaError(message: string | undefined, code?: string) {
  return (
    code === '42P01' ||
    (message?.includes('commercial_followups') ?? false) ||
    (message?.includes('commercial_followup_reminders') ?? false)
  )
}

export async function fetchCommercialFollowups(
  companyId: string,
  subjectType: CommercialFollowupSubject,
  opts: { quoteId?: string; invoiceId?: string },
): Promise<CommercialFollowup[]> {
  let q = supabase
    .from('commercial_followups')
    .select('*')
    .eq('company_id', companyId)
    .eq('subject_type', subjectType)
    .order('followed_at', { ascending: false })

  if (subjectType === 'quote' && opts.quoteId) q = q.eq('quote_id', opts.quoteId)
  if (subjectType === 'invoice' && opts.invoiceId) q = q.eq('invoice_id', opts.invoiceId)

  const { data, error } = await q
  if (error) {
    if (isMissingImportanceColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna importance o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_IMPORTANCE_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      console.warn('[commercial_followups]', error.message)
      return []
    }
    throw new Error(error.message)
  }
  return (data ?? []).map(r => mapFollowupRow(r as CommercialFollowup))
}

export async function fetchOpenReminder(
  companyId: string,
  subjectType: CommercialFollowupSubject,
  opts: { quoteId?: string; invoiceId?: string },
): Promise<CommercialFollowupReminder | null> {
  let q = supabase
    .from('commercial_followup_reminders')
    .select('*')
    .eq('company_id', companyId)
    .eq('subject_type', subjectType)
    .eq('status', 'open')

  if (subjectType === 'company') {
    q = q.is('quote_id', null).is('invoice_id', null)
  } else if (subjectType === 'quote') {
    if (!opts.quoteId) return null
    q = q.eq('quote_id', opts.quoteId)
  } else {
    if (!opts.invoiceId) return null
    q = q.eq('invoice_id', opts.invoiceId)
  }

  const { data, error } = await q.maybeSingle()
  if (error) {
    if (isMissingImportanceColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna importance o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_IMPORTANCE_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isCommercialFollowupsSchemaError(error.message, error.code)) return null
    throw new Error(error.message)
  }
  if (!data) return null
  return mapReminderRow(data as CommercialFollowupReminder)
}

/** Recordatorios abiertos en un rango de fechas (agenda; visibles para todos los KAM con acceso a la empresa). */
export async function fetchOpenCommercialRemindersInRange(opts: {
  companyId?: string
  desde: string
  hasta: string
}): Promise<
  Array<
    CommercialFollowupReminder & {
      company?: { name: string } | null
      quote?: { quote_number: string | null; title: string | null } | null
      invoice?: { invoice_number: string; title: string | null } | null
      /** Seguimiento que abrió el recordatorio (`body` = texto libre que escribe el usuario). */
      source_followup?: { body: string | null; next_follow_up_kind?: CommercialFollowupNextChannel | null } | null
    }
  >
> {
  let q = supabase
    .from('commercial_followup_reminders')
    .select(
      `
      *,
      company:companies(name),
      quote:quotes(quote_number, title, kam_id),
      invoice:invoices(invoice_number, title),
      source_followup:commercial_followups!source_followup_id(body, next_follow_up_kind)
    `,
    )
    .eq('status', 'open')
    .gte('due_date', `${opts.desde}T00:00:00.000Z`)
    .lte('due_date', `${opts.hasta}T23:59:59.999Z`)
    .order('due_date', { ascending: true })
    .limit(800)

  if (opts.companyId) q = q.eq('company_id', opts.companyId)

  const { data, error } = await q
  if (error) {
    if (isMissingImportanceColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna importance o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_IMPORTANCE_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isCommercialFollowupsSchemaError(error.message, error.code)) return []
    throw new Error(error.message)
  }

  const rows = data ?? []
  return rows.map(r => mapReminderRow(r as CommercialFollowupReminder)) as Array<
    CommercialFollowupReminder & {
      company?: { name: string } | null
      quote?: { quote_number: string | null; title: string | null } | null
      invoice?: { invoice_number: string; title: string | null } | null
      source_followup?: { body: string | null; next_follow_up_kind?: CommercialFollowupNextChannel | null } | null
    }
  >
}

export type CommercialFollowupInsert = {
  company_id: string
  subject_type: CommercialFollowupSubject
  quote_id?: string | null
  invoice_id?: string | null
  contact_id: string | null
  created_by?: string | null
  followed_at: string
  body: string
  /** Obligatorio al crear desde la app: siempre debe haber fecha de próximo seguimiento en agenda. */
  next_follow_up_at: string
  next_follow_up_kind?: CommercialFollowupNextChannel
  importance?: CommercialFollowupImportance
}

export async function insertCommercialFollowup(row: CommercialFollowupInsert): Promise<CommercialFollowup> {
  const { data, error } = await supabase.from('commercial_followups').insert(row).select('*').single()
  if (error) {
    if (isMissingNextChannelColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna next_follow_up_kind o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_NEXT_CHANNEL_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isMissingImportanceColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna importance o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_IMPORTANCE_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
  return mapFollowupRow(data as CommercialFollowup)
}

export async function updateCommercialFollowup(
  id: string,
  patch: Partial<
    Pick<
      CommercialFollowup,
      'followed_at' | 'body' | 'contact_id' | 'next_follow_up_at' | 'next_follow_up_kind' | 'importance'
    >
  >,
): Promise<CommercialFollowup> {
  const { data, error } = await supabase.from('commercial_followups').update(patch).eq('id', id).select('*').single()
  if (error) {
    if (isMissingNextChannelColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna next_follow_up_kind o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_NEXT_CHANNEL_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isMissingImportanceColumnMessage(error.message)) {
      throw new Error(
        `Falta la columna importance o el esquema en caché no está actualizado.\n\n${COMMERCIAL_FOLLOWUPS_IMPORTANCE_MIGRATION_HINT}\n\nDetalle: ${error.message}`,
      )
    }
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
  return mapFollowupRow(data as CommercialFollowup)
}

/** Si el recordatorio abierto proviene de este seguimiento, actualiza su importancia (tras editar en la UI). */
export async function syncOpenReminderImportanceFromFollowup(
  followupId: string,
  importance: CommercialFollowupImportance,
): Promise<void> {
  const { error } = await supabase
    .from('commercial_followup_reminders')
    .update({ importance })
    .eq('source_followup_id', followupId)
    .eq('status', 'open')

  if (error) {
    if (isMissingImportanceColumnMessage(error.message) || isCommercialFollowupsSchemaError(error.message, error.code)) {
      console.warn('[syncOpenReminderImportanceFromFollowup]', error.message)
      return
    }
    throw new Error(error.message)
  }
}

/** Alinea la fecha del recordatorio abierto si proviene de este seguimiento (edición de próximo contacto). */
export async function syncOpenReminderDueDateFromFollowup(followupId: string, nextFollowUpAtIso: string): Promise<void> {
  const { error } = await supabase
    .from('commercial_followup_reminders')
    .update({ due_date: nextFollowUpAtIso })
    .eq('source_followup_id', followupId)
    .eq('status', 'open')

  if (error) {
    if (
      isMissingImportanceColumnMessage(error.message) ||
      isMissingNextChannelColumnMessage(error.message) ||
      isCommercialFollowupsSchemaError(error.message, error.code)
    ) {
      console.warn('[syncOpenReminderDueDateFromFollowup]', error.message)
      return
    }
    throw new Error(error.message)
  }
}

/** Alinea Reunión/Mail/Llamado del recordatorio abierto con el seguimiento editado. */
export async function syncOpenReminderNextChannelFromFollowup(
  followupId: string,
  kind: CommercialFollowupNextChannel,
): Promise<void> {
  const { error } = await supabase
    .from('commercial_followup_reminders')
    .update({ next_follow_up_kind: kind })
    .eq('source_followup_id', followupId)
    .eq('status', 'open')

  if (error) {
    if (
      isMissingNextChannelColumnMessage(error.message) ||
      isMissingImportanceColumnMessage(error.message) ||
      isCommercialFollowupsSchemaError(error.message, error.code)
    ) {
      console.warn('[syncOpenReminderNextChannelFromFollowup]', error.message)
      return
    }
    throw new Error(error.message)
  }
}

export async function deleteCommercialFollowup(id: string): Promise<void> {
  const { error } = await supabase.from('commercial_followups').delete().eq('id', id)
  if (error) {
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
}

export async function closeCommercialReminderManual(reminderId: string): Promise<void> {
  const { error } = await supabase
    .from('commercial_followup_reminders')
    .update({
      status: 'cancelled',
      closed_at: new Date().toISOString(),
      closed_reason: 'manual',
    })
    .eq('id', reminderId)
    .eq('status', 'open')

  if (error) {
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
}

export async function updateCommercialReminderDueDate(reminderId: string, dueDateIso: string): Promise<void> {
  const { error } = await supabase
    .from('commercial_followup_reminders')
    .update({ due_date: dueDateIso })
    .eq('id', reminderId)
    .eq('status', 'open')

  if (error) {
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
}

export async function fetchInvoicesByCompany(companyId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }
  return (data ?? []) as Invoice[]
}

export async function insertInvoice(row: {
  company_id: string
  quote_id?: string | null
  invoice_number: string
  title?: string | null
  status?: InvoiceStatus
  total?: number
  currency?: string
}): Promise<Invoice> {
  const { data, error } = await supabase.from('invoices').insert(row).select('*').single()
  if (error) {
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
  return data as Invoice
}

/** Marca la factura como pagada (el trigger cancela recordatorios abiertos de ese hilo). */
export async function markInvoiceAsPaid(invoiceId: string): Promise<void> {
  const paidAt = new Date().toISOString()
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'pagada', paid_at: paidAt })
    .eq('id', invoiceId)
    .in('status', ['pendiente', 'borrador'])

  if (error) {
    if (error.code === '42P01') {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
}

/** Deshace el cierre por pago: vuelve a pendiente sin fecha de pago (solo si estaba pagada). */
export async function reopenInvoiceAsPending(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'pendiente', paid_at: null })
    .eq('id', invoiceId)
    .eq('status', 'pagada')

  if (error) {
    if (error.code === '42P01') {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
}

/** Etapas que cierran el pendiente de seguimiento en cotización. */
export function isQuoteFollowupClosedStage(stage: string): boolean {
  return (QUOTE_FOLLOWUP_CLOSED_STAGES as readonly string[]).includes(normalizeQuoteStage(stage))
}

/**
 * Cierra o reabre recordatorios de seguimiento en cotización según el cambio de etapa.
 * Complementa el trigger `quotes_close_commercial_reminders` en Supabase.
 */
export async function syncQuoteFollowupRemindersForStage(
  quoteId: string,
  previousStage: string,
  newStage: string,
): Promise<void> {
  const oldS = normalizeQuoteStage(previousStage)
  const newS = normalizeQuoteStage(newStage)
  if (oldS === newS) return

  const wasClosed = isQuoteFollowupClosedStage(oldS)
  const nowClosed = isQuoteFollowupClosedStage(newS)

  if (nowClosed && !wasClosed) {
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
    if (error) {
      if (isCommercialFollowupsSchemaError(error.message, error.code)) return
      throw new Error(error.message)
    }
    return
  }

  if (wasClosed && !nowClosed) {
    const { error } = await supabase
      .from('commercial_followup_reminders')
      .update({
        status: 'open',
        closed_at: null,
        closed_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('quote_id', quoteId)
      .eq('subject_type', 'quote')
      .eq('status', 'cancelled')
      .eq('closed_reason', 'quote_closed')
    if (error) {
      if (isCommercialFollowupsSchemaError(error.message, error.code)) return
      throw new Error(error.message)
    }
  }
}

/** Invalida agenda y recordatorios abiertos tras cambio de etapa en cotización. */
export function invalidateQuoteFollowupAgendaQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['agenda-pendientes'] })
  void queryClient.invalidateQueries({ queryKey: ['cf-open-reminder'] })
}

/** Reabre la cotización en negociación (p. ej. cierre equivocado). */
export async function reopenQuoteNegotiationStage(quoteId: string): Promise<void> {
  const { data: row, error: fe } = await supabase.from('quotes').select('stage').eq('id', quoteId).single()
  if (fe) throw new Error(fe.message)
  const prevStage = normalizeQuoteStage((row?.stage as string | undefined) ?? 'borrador')

  const { error } = await supabase
    .from('quotes')
    .update({ stage: 'en_negociacion', closed_at: null })
    .eq('id', quoteId)
    .in('stage', ['aceptada', 'rechazada', 'facturada', 'orden_de_venta'])

  if (error) throw new Error(error.message)

  await syncQuoteFollowupRemindersForStage(quoteId, prevStage, 'en_negociacion')
}

/**
 * Restaura un pendiente de agenda en el hilo «empresa» usando el último seguimiento registrado.
 */
export async function reopenCompanyCommercialReminder(companyId: string): Promise<void> {
  const existing = await fetchOpenReminder(companyId, 'company', {})
  if (existing) throw new Error('Ya existe un pendiente abierto para esta empresa.')

  const followups = await fetchCommercialFollowups(companyId, 'company', {})
  const latest = followups[0]
  if (!latest) throw new Error('No hay historial de llamados para reabrir el seguimiento.')

  let dueIso: string
  if (latest.next_follow_up_at) {
    const t = new Date(latest.next_follow_up_at).getTime()
    dueIso =
      t < Date.now()
        ? new Date(Date.now() + 86_400_000).toISOString()
        : latest.next_follow_up_at
  } else {
    dueIso = new Date(Date.now() + 86_400_000).toISOString()
  }

  const { error } = await supabase.from('commercial_followup_reminders').insert({
    company_id: companyId,
    subject_type: 'company',
    quote_id: null,
    invoice_id: null,
    due_date: dueIso,
    status: 'open',
    source_followup_id: latest.id,
    importance: latest.importance ?? 'media',
    next_follow_up_kind: latest.next_follow_up_kind ?? 'llamado',
  })

  if (error) {
    if (isCommercialFollowupsSchemaError(error.message, error.code)) {
      throw new Error(`${COMMERCIAL_FOLLOWUPS_SETUP_HINT} (${error.message})`)
    }
    throw new Error(error.message)
  }
}
