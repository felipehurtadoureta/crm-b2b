/**
 * Etiquetas, formato y piezas de UI compartidas entre ficha empresa y cotización (CRM v2).
 */
import {
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  StickyNote,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CrmTask, CrmTaskPriority, Interaction, InteractionOutcome, InteractionType } from '@/types'

export const INTERACTION_TYPES: InteractionType[] = [
  'call',
  'meeting',
  'email',
  'whatsapp',
  'follow_up',
  'presentation',
  'note',
  'visit',
  'quote_sent',
  'quote_update',
  'quote_approved',
  'quote_rejected',
  'reminder',
]

/** Tipos mostrados al registrar o editar una interacción (el resto puede existir en histórico). */
export const INTERACTION_FORM_TYPES: InteractionType[] = ['call', 'meeting', 'email', 'whatsapp']

export const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  call: 'Llamada',
  meeting: 'Reunión',
  email: 'Correo',
  whatsapp: 'WhatsApp',
  follow_up: 'Seguimiento',
  presentation: 'Presentación',
  note: 'Nota',
  visit: 'Visita',
  quote_sent: 'Cotización enviada',
  quote_update: 'Actualización cotización',
  quote_approved: 'Cotización aprobada',
  quote_rejected: 'Cotización rechazada',
  reminder: 'Recordatorio',
}

/** Resultados mostrados al registrar/editar interacción (el resto puede existir en datos históricos). */
export const INTERACTION_FORM_OUTCOMES: (InteractionOutcome | '')[] = [
  '',
  'follow_up_later',
  'not_interested',
  'meeting_scheduled',
  'quote_sent',
]

export const OUTCOMES: (InteractionOutcome | '')[] = [
  '',
  'interested',
  'not_interested',
  'pending',
  'follow_up_later',
  'meeting_scheduled',
  'send_information',
  'quote_sent',
  'quote_under_review',
  'quote_approved',
  'quote_rejected',
  'no_response',
]

export const OUTCOME_LABEL: Record<InteractionOutcome, string> = {
  interested: 'Interesado',
  not_interested: 'No interesado',
  pending: 'Pendiente',
  follow_up_later: 'Volver a contactar',
  meeting_scheduled: 'Reunión',
  send_information: 'Enviar información',
  quote_sent: 'Se envía cotización',
  quote_under_review: 'Cotización en revisión',
  quote_approved: 'Cotización aprobada',
  quote_rejected: 'Cotización rechazada',
  no_response: 'Sin respuesta',
}

export const TASK_PRIORITY_LABEL: Record<CrmTaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

export function crmListScrollClass(count: number) {
  return count > 6 ? 'max-h-[min(26rem,70vh)] overflow-y-auto overscroll-contain pr-0.5' : ''
}

/** Títulos antiguos guardados solo como «Tarea» (sin detalle). */
const LEGACY_PLACEHOLDER_TASK_TITLE = /^tarea\s*$/i

/**
 * Texto que va entre paréntesis en listas y cabeceras: título guardado o, si era genérico, un extracto de la descripción.
 */
export function taskTitleInnerForDisplay(raw: string | null | undefined, description?: string | null): string {
  const t = (raw ?? '').trim()
  if (t.length > 0 && !LEGACY_PLACEHOLDER_TASK_TITLE.test(t)) return t
  const d = (description ?? '').trim().replace(/\s+/g, ' ')
  if (d) return d.length > 120 ? `${d.slice(0, 117)}…` : d
  return 'Sin título'
}

/** Etiqueta unificada en el módulo CRM: «Tarea: (…)». */
export function formatTaskTitleForDisplay(raw: string | null | undefined, description?: string | null): string {
  return `Tarea: (${taskTitleInnerForDisplay(raw, description)})`
}

export function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function fmtCompactDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function buildAutoInteractionTitle(
  type: InteractionType,
  interactionDateIso: string,
  notes: string,
) {
  const label = INTERACTION_TYPE_LABEL[type]
  const day = fmtCompactDate(interactionDateIso)
  const n = notes.trim()
  if (!n) return `${label} · ${day}`
  const clip = n.length > 80 ? `${n.slice(0, 80).trimEnd()}…` : n
  return `${label} · ${day} — ${clip}`
}

/** Vencimiento sugerido para tarea tras resultado «No interesado» (+1 mes, 09:00). */
export function defaultTaskDueOneMonthLocal() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setHours(9, 0, 0, 0)
  return toDatetimeLocalValue(d.toISOString())
}

export function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(local: string) {
  const d = new Date(local)
  return d.toISOString()
}

export function defaultTaskDueLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return toDatetimeLocalValue(d.toISOString())
}

export function InteractionTypeIcon({ type, className }: { type: InteractionType; className?: string }) {
  const c = cn('shrink-0 text-gray-400', className)
  switch (type) {
    case 'whatsapp':
      return <MessageCircle size={14} className={c} />
    case 'email':
      return <Mail size={14} className={c} />
    case 'meeting':
    case 'presentation':
      return <Users size={14} className={c} />
    case 'visit':
      return <MapPin size={14} className={c} />
    case 'note':
    case 'reminder':
      return <StickyNote size={14} className={c} />
    default:
      if (type.startsWith('quote_') || type === 'quote_sent')
        return <FileText size={14} className={c} />
      return <Phone size={14} className={c} />
  }
}

export function buildUpcomingTasks(tasks: CrmTask[]) {
  return tasks
    .filter(t => t.status === 'pending' || t.status === 'in_progress')
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
}

export type HistorialEntry =
  | { kind: 'interaction'; ts: string; row: Interaction }
  | { kind: 'task'; ts: string; row: CrmTask }

export type QuoteCrmActivityCounts = {
  interactions: number
  tasks: number
}

/** Conteos de interacciones y tareas por cotización (solo filas con `quote_id`). */
export function buildQuoteCrmActivityCounts(
  quoteIds: string[],
  interactions: Interaction[],
  tasks: CrmTask[],
): Map<string, QuoteCrmActivityCounts> {
  const map = new Map<string, QuoteCrmActivityCounts>()
  for (const id of quoteIds) {
    map.set(id, { interactions: 0, tasks: 0 })
  }
  for (const row of interactions) {
    if (!row.quote_id || !map.has(row.quote_id)) continue
    map.get(row.quote_id)!.interactions += 1
  }
  for (const row of tasks) {
    if (!row.quote_id || !map.has(row.quote_id)) continue
    map.get(row.quote_id)!.tasks += 1
  }
  return map
}

export function buildHistorialEntries(interactions: Interaction[], tasks: CrmTask[]): HistorialEntry[] {
  const closed = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled')
  const iEntries: HistorialEntry[] = interactions.map(row => ({
    kind: 'interaction',
    ts: row.interaction_date,
    row,
  }))
  const tEntries: HistorialEntry[] = closed.map(row => {
    const ts =
      row.status === 'completed' && row.completed_at
        ? row.completed_at
        : row.updated_at || row.due_date
    return { kind: 'task', ts, row }
  })
  return [...iEntries, ...tEntries].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}

export const NOTAS_COMPACTAS_MAX = 72

export function NotesCompactLine({
  text,
  expanded,
  onToggleExpand,
}: {
  text: string | null
  expanded: boolean
  onToggleExpand: () => void
}) {
  const raw = text?.trim() ?? ''
  const needsMore = raw.length > NOTAS_COMPACTAS_MAX
  return (
    <div className="flex min-w-0 flex-1 items-start gap-1">
      <p className={cn('text-xs text-gray-700 min-w-0', !expanded && 'line-clamp-1')}>
        {raw || '—'}
      </p>
      {needsMore && (
        <button
          type="button"
          className="shrink-0 text-violet-600 font-bold text-xs leading-none px-0.5 py-0.5 rounded hover:bg-violet-50"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            onToggleExpand()
          }}
          aria-expanded={expanded}
          aria-label={expanded ? 'Ver menos' : 'Ver más'}
        >
          {expanded ? '−' : '+'}
        </button>
      )}
    </div>
  )
}
