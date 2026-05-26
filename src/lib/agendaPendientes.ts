/**
 * Agenda unificada (CRM actual): tareas del módulo CRM v2 (`tasks`) y fechas de cierre estimado
 * en cotizaciones en pipeline. Sin `activities` ni próximo contacto en `calls` (flujos legacy).
 */
import { supabase } from '@/lib/supabase'
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from '@/lib/crmV2Display'
import type { CrmTaskPriority, QuoteStage, CommercialFollowupSubject, CommercialFollowupImportance } from '@/types'
import {
  buildFollowupAgendaTitulo,
  fetchOpenCommercialRemindersInRange,
  normalizeNextChannel,
} from '@/lib/commercialFollowupsQuery'

export type PendienteFuente = 'quote_close' | 'crm_task' | 'followup'

export interface PendienteItem {
  /** Clave estable para React (incluye fuente para no colisionar ids de tablas distintas) */
  key: string
  fuente: PendienteFuente
  /** Fecha relevante para ordenar y agrupar (YYYY-MM-DD) */
  fecha: string
  /** ISO completo para mostrar hora en tareas CRM cuando exista */
  detalleFechaIso?: string | null
  titulo: string
  subtitulo: string
  /** Texto libre que describe el evento (seguimiento: cuerpo del registro CRM; tarea: descripción). */
  detalleEvento?: string | null
  companyId: string
  companyName: string
  /** Tarea en tabla `tasks` (módulo CRM v2) */
  crmTaskId?: string
  quoteId?: string
  quoteNumber?: string
  invoiceId?: string
  /** Solo tareas CRM: prioridad para resaltar urgencias en la vista mes. */
  crmTaskPriority?: CrmTaskPriority | null
  /** Recordatorio abierto en `commercial_followup_reminders` */
  followupSubject?: CommercialFollowupSubject
  followupReminderId?: string
  /** Prioridad del recordatorio (copiada del último seguimiento que fijó la fecha). */
  followupImportance?: CommercialFollowupImportance
  /** Cotización «dueña» para comprobar permisos KAM en acciones de agenda */
  quoteKamId?: string
  /** Tarea CRM: responsable (para permitir reprogramar) */
  crmAssignedTo?: string | null
}

const PIPELINE: QuoteStage[] = ['borrador', 'en_negociacion', 'enviada']

function toDay(d: string | null | undefined): string | null {
  if (!d) return null
  return d.slice(0, 10)
}

/** PostgREST suele devolver FK embebidas como objeto o como array de un elemento. */
function firstEmbedded<T extends object>(v: unknown): T | null {
  if (v == null || typeof v !== 'object') return null
  if (Array.isArray(v)) return (v[0] as T | undefined) ?? null
  return v as T
}

export interface FetchPendientesOpts {
  companyId?: string
  profile: { id: string; role: string } | null
  diasAdelante?: number
  diasAtras?: number
}

/**
 * Pendientes para la agenda: tareas CRM v2, cierres estimados en pipeline y seguimientos comerciales (recordatorios).
 */
export async function fetchPendientes(opts: FetchPendientesOpts): Promise<PendienteItem[]> {
  const { companyId, profile } = opts
  const diasAdelante = opts.diasAdelante ?? 60
  const diasAtras = opts.diasAtras ?? 90
  const hoy = new Date()
  const desde = new Date(hoy.getTime() - diasAtras * 86_400_000).toISOString().slice(0, 10)
  const hasta = new Date(hoy.getTime() + diasAdelante * 86_400_000).toISOString().slice(0, 10)
  const hoyStr = hoy.toISOString().slice(0, 10)

  const esKam = profile?.role === 'kam'
  const uid = profile?.id

  // ── Cotizaciones: cierre estimado en pipeline ─────────────────────
  let quoteQ = supabase
    .from('quotes')
    .select('id, quote_number, title, expected_close, stage, company_id, kam_id, company:companies(name)')
    .in('stage', PIPELINE)
    .order('expected_close', { ascending: true, nullsFirst: false })
    .limit(200)

  if (companyId) quoteQ = quoteQ.eq('company_id', companyId)
  if (esKam && uid) quoteQ = quoteQ.eq('kam_id', uid)

  const { data: quoteRowsRaw, error: quoteErr } = await quoteQ
  if (quoteErr) console.warn('[agenda] quotes expected_close', quoteErr.message)

  /** Incluir cierres atrasados en la ventana (aparecen como vencidos), no solo desde hoy. */
  const quoteRows = (quoteRowsRaw ?? []).filter((r: { expected_close?: string | null }) => {
    const d = toDay(r.expected_close)
    if (!d) return false
    return d >= desde && d <= hasta
  })

  const cotizaciones: PendienteItem[] = quoteRows.map((r: any) => {
    const fecha = toDay(r.expected_close) ?? hoyStr
    const co = firstEmbedded<{ name?: string | null }>(r.company)
    const empresa = co?.name?.trim() ? String(co.name) : 'Empresa'
    return {
      key: `quote:${r.id}`,
      fuente: 'quote_close' as const,
      fecha,
      detalleFechaIso: r.expected_close ?? null,
      titulo: `Cierre estimado · ${r.quote_number ?? r.id.slice(0, 8)}`,
      subtitulo: `${r.title ?? 'Cotización'} · ${r.stage ?? ''}`,
      companyId: r.company_id,
      companyName: empresa,
      quoteId: r.id,
      quoteNumber: r.quote_number,
      quoteKamId: r.kam_id ?? undefined,
    }
  })

  // ── Tareas CRM v2 (`tasks`) ───────────────────────────────────────
  let crmTaskQ = supabase
    .from('tasks')
    .select('id, title, description, due_date, priority, status, company_id, quote_id, assigned_to, company:companies(name)')
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true })
    .limit(400)

  if (companyId) crmTaskQ = crmTaskQ.eq('company_id', companyId)
  if (esKam && uid) crmTaskQ = crmTaskQ.eq('assigned_to', uid)

  const { data: crmTaskRowsRaw, error: crmTaskErr } = await crmTaskQ
  if (crmTaskErr && crmTaskErr.code !== '42P01' && !crmTaskErr.message?.includes('does not exist')) {
    console.warn('[agenda] tasks (CRM v2)', crmTaskErr.message)
  }

  const crmTaskRows = (crmTaskRowsRaw ?? []).filter((r: { due_date?: string | null }) => {
    const d = toDay(r.due_date)
    if (!d) return false
    return d >= desde && d <= hasta
  })

  const crmQuoteIds = [...new Set(crmTaskRows.map((r: { quote_id?: string | null }) => r.quote_id).filter(Boolean))] as string[]
  const crmQuoteNumById = new Map<string, string>()
  if (crmQuoteIds.length > 0) {
    const { data: crmQm, error: crmQmErr } = await supabase.from('quotes').select('id, quote_number').in('id', crmQuoteIds)
    if (crmQmErr) console.warn('[agenda] quotes for crm_task', crmQmErr.message)
    for (const q of crmQm ?? []) {
      const row = q as { id: string; quote_number: string | null }
      if (row.quote_number) crmQuoteNumById.set(row.id, row.quote_number)
    }
  }

  const tareasCrm: PendienteItem[] = crmTaskRows.map((r: any) => {
    const fecha = toDay(r.due_date) ?? hoyStr
    const co = firstEmbedded<{ name?: string | null }>(r.company)
    const empresa = co?.name?.trim() ? String(co.name) : 'Empresa'
    const pr = TASK_PRIORITY_LABEL[(r.priority as CrmTaskPriority) ?? 'medium'] ?? String(r.priority)
    const st = TASK_STATUS_LABEL[r.status] ?? r.status
    const qn = r.quote_id ? crmQuoteNumById.get(r.quote_id as string) : undefined
    const subt = qn ? `${st} · Prioridad ${pr} · Cot. ${qn}` : `${st} · Prioridad ${pr}`
    const priority = (r.priority as CrmTaskPriority) ?? 'medium'
    return {
      key: `crm_task:${r.id}`,
      fuente: 'crm_task' as const,
      fecha,
      detalleFechaIso: r.due_date ?? null,
      titulo: r.title ?? 'Tarea sin título',
      detalleEvento: typeof r.description === 'string' && r.description.trim() ? r.description.trim() : null,
      subtitulo: subt,
      companyId: r.company_id,
      companyName: empresa,
      quoteId: r.quote_id ?? undefined,
      quoteNumber: qn,
      crmTaskId: r.id,
      crmTaskPriority: priority,
      crmAssignedTo: r.assigned_to ?? null,
    }
  })

  // ── Seguimientos comerciales (recordatorios abiertos; visibles para todo KAM con acceso a la empresa) ──
  let seguimientos: PendienteItem[] = []
  try {
    const reminderRows = await fetchOpenCommercialRemindersInRange({
      companyId,
      desde,
      hasta,
    })
    seguimientos = reminderRows.map(r => {
      const fecha = toDay(r.due_date) ?? hoyStr
      const sf = firstEmbedded<{ body?: string | null; next_follow_up_kind?: string | null }>(
        (r as { source_followup?: unknown }).source_followup,
      )
      const cuerpoSeguimiento =
        sf?.body != null && String(sf.body).trim() ? String(sf.body).trim() : null

      const channel =
        normalizeNextChannel(r.next_follow_up_kind) ??
        normalizeNextChannel(sf?.next_follow_up_kind) ??
        'llamado'

      const companyEmbed = firstEmbedded<{ name?: string | null }>(r.company)
      const empresa = companyEmbed?.name?.trim() ? String(companyEmbed.name) : 'Empresa'
      let subtitulo = empresa
      let quoteKamId: string | undefined
      let titulo = buildFollowupAgendaTitulo(channel, 'company')
      if (r.subject_type === 'quote') {
        const q = firstEmbedded<{ quote_number?: string | null; title?: string | null; kam_id?: string | null }>(r.quote)
        const qn = q?.quote_number != null ? String(q.quote_number) : ''
        titulo = buildFollowupAgendaTitulo(channel, 'quote', { quoteNumber: qn })
        subtitulo = q?.title?.trim() ? String(q.title) : empresa
        quoteKamId = q?.kam_id ?? undefined
      } else if (r.subject_type === 'invoice') {
        const inv = firstEmbedded<{ invoice_number?: string; title?: string | null }>(r.invoice)
        const inn = inv?.invoice_number != null ? String(inv.invoice_number) : ''
        titulo = buildFollowupAgendaTitulo(channel, 'invoice', { invoiceNumber: inn })
        subtitulo = inv?.title?.trim() ? String(inv.title) : empresa
      }
      return {
        key: `cf_reminder:${r.id}`,
        fuente: 'followup' as const,
        fecha,
        detalleFechaIso: r.due_date,
        titulo,
        detalleEvento: cuerpoSeguimiento,
        subtitulo: subtitulo || empresa,
        companyId: r.company_id,
        companyName: empresa,
        quoteId: r.quote_id ?? undefined,
        invoiceId: r.invoice_id ?? undefined,
        followupSubject: r.subject_type,
        followupReminderId: r.id,
        followupImportance: r.importance,
        quoteKamId: r.subject_type === 'quote' ? quoteKamId : undefined,
      }
    })
  } catch (e) {
    console.warn('[agenda] commercial followup reminders', e)
  }

  const merged = [...cotizaciones, ...tareasCrm, ...seguimientos]
  merged.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.titulo.localeCompare(b.titulo)
  })
  return merged
}

export function bucketPendiente(fecha: string, hoyStr: string): 'vencido' | 'hoy' | 'semana' | 'luego' {
  if (fecha < hoyStr) return 'vencido'
  if (fecha === hoyStr) return 'hoy'
  const finSemana = new Date()
  finSemana.setDate(finSemana.getDate() + 7)
  const finStr = finSemana.toISOString().slice(0, 10)
  if (fecha <= finStr) return 'semana'
  return 'luego'
}
