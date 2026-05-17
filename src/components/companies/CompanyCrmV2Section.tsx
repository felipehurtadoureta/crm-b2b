/**
 * Actividad comercial v2: tablas `interactions` y `tasks` (independiente del historial `calls`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  CalendarDays,
  ClipboardList,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  ScrollText,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  INTERACTION_FORM_TYPES,
  INTERACTION_TYPE_LABEL,
  INTERACTION_FORM_OUTCOMES,
  OUTCOME_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  buildAutoInteractionTitle,
  buildHistorialEntries,
  buildQuoteCrmActivityCounts,
  buildUpcomingTasks,
  crmListScrollClass,
  defaultTaskDueLocal,
  defaultTaskDueOneMonthLocal,
  fmtCompactDate,
  fmtDateTime,
  formatTaskTitleForDisplay,
  fromDatetimeLocalValue,
  InteractionTypeIcon,
  toDatetimeLocalValue,
} from '@/lib/crmV2Display'
import CompanyCrmV2HistorialCompletoDialog, { type FullHistorialTab } from '@/components/companies/CompanyCrmV2HistorialCompletoDialog'
import {
  useCreateInteraction,
  useDeleteInteraction,
  useInteractions,
  useInteractionsAllByCompany,
  useUpdateInteraction,
} from '@/hooks/useInteractions'
import { useCreateTask, useDeleteTask, useTasks, useTasksAllByCompany, useUpdateTask } from '@/hooks/useTasks'
import type {
  Contact,
  CrmTask,
  CrmTaskPriority,
  CrmTaskStatus,
  CrmTaskUpdate,
  Interaction,
  InteractionOutcome,
  InteractionType,
  Profile,
  QuoteStage,
} from '@/types'

/** Pestañas del bloque Actividad comercial en ficha empresa */
export type CompanyCrmV2Tab = 'timeline' | 'interactions' | 'tasks' | 'quotes'

type CrmTab = CompanyCrmV2Tab

const QUOTE_STAGE_LABEL: Record<QuoteStage, string> = {
  borrador: 'Borrador',
  en_negociacion: 'En negociación',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  facturada: 'Facturada',
}

/** Botones de acción del bloque (mismo estilo que atajos de la ficha empresa) */
const CRM_ACTION_BTN =
  'h-8 px-3 text-xs font-medium gap-1.5 shrink-0 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'

const QUOTE_STAGE_STYLE: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-700',
  en_negociacion: 'bg-violet-100 text-violet-800',
  enviada: 'bg-blue-100 text-blue-800',
  aceptada: 'bg-emerald-100 text-emerald-800',
  facturada: 'bg-teal-100 text-teal-800',
  rechazada: 'bg-red-100 text-red-700',
}

function fmtQuoteMoney(amount: number, currency: string) {
  if (currency === 'CLP')
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount)
  if (currency === 'USD')
    return `US$ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`
  return `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
}

export interface CompanyCrmV2QuoteRef {
  id: string
  quote_number: string
  title?: string | null
}

/** Fila de cotización para la pestaña integrada en Actividad comercial */
export interface CompanyCrmV2QuotesTabRow {
  id: string
  quote_number: string
  title: string | null
  stage: QuoteStage
  total: number
  currency: string
  kamFullName?: string | null
}

export interface CompanyCrmV2SectionProps {
  companyId: string
  contacts: Contact[]
  quotes: CompanyCrmV2QuoteRef[]
  kams: Profile[]
  currentProfileId: string | undefined
  canEdit: boolean
  /** KAM principal de la empresa (p. ej. lead); usado al crear cotización desde interacción */
  preferredKamId?: string | null
  /** Tras crear cotización u otros datos externos, recargar la ficha */
  onDataChange?: () => void
  /** Lista de cotizaciones para la pestaña «Cotizaciones» (ficha empresa) */
  quotesForTab?: CompanyCrmV2QuotesTabRow[]
  /** Atajo externo: activar esta pestaña al montar/actualizar (p. ej. botón Cotizaciones) */
  tabRequest?: CompanyCrmV2Tab | null
  onTabRequestHandled?: () => void
  /** Agenda filtrada por empresa (solo ficha empresa; se muestra junto a Historial) */
  agendaHref?: string
}

export default function CompanyCrmV2Section({
  companyId,
  contacts,
  quotes,
  kams,
  currentProfileId,
  canEdit,
  preferredKamId,
  onDataChange,
  quotesForTab,
  tabRequest,
  onTabRequestHandled,
  agendaHref,
}: CompanyCrmV2SectionProps) {
  const [tab, setTab] = useState<CrmTab>('timeline')
  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  const [interactionEditing, setInteractionEditing] = useState<Interaction | null>(null)
  const [ixDetail, setIxDetail] = useState<Interaction | null>(null)
  const [taskDetail, setTaskDetail] = useState<CrmTask | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<CrmTask | null>(null)
  const [historialCompletoOpen, setHistorialCompletoOpen] = useState(false)
  const [fullHistTab, setFullHistTab] = useState<FullHistorialTab>('historial')

  useEffect(() => {
    if (tabRequest == null) return
    setTab(tabRequest)
    onTabRequestHandled?.()
  }, [tabRequest, onTabRequestHandled])

  const iq = useInteractions(companyId, true)
  const tq = useTasks(companyId, true)
  const iqa = useInteractionsAllByCompany(companyId, true)
  const tqa = useTasksAllByCompany(companyId, true)

  const createIx = useCreateInteraction(companyId)
  const updateIx = useUpdateInteraction(companyId)
  const deleteIx = useDeleteInteraction(companyId)
  const createTask = useCreateTask(companyId)
  const updateTask = useUpdateTask(companyId)
  const deleteTask = useDeleteTask(companyId)

  const createBlankQuote = useCallback(
    async (contactIdVal: string | null): Promise<{ id: string; quote_number: string }> => {
      const kamId = preferredKamId ?? currentProfileId ?? kams.find(k => k.is_active)?.id
      if (!kamId) throw new Error('No hay KAM para asignar a la cotización.')
      const { count, error: cErr } = await supabase.from('quotes').select('id', { count: 'exact', head: true })
      if (cErr) throw new Error(cErr.message)
      const quoteNumber = `COT-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { data, error } = await supabase.from('quotes').insert({
        company_id: companyId,
        contact_id: contactIdVal,
        kam_id: kamId,
        quote_number: quoteNumber,
        title: 'Nueva cotización',
        stage: 'borrador',
        probability: 20,
        currency: 'CLP',
        subtotal: 0,
        tax_amount: 0,
        total: 0,
        is_tax_exempt: false,
      }).select('id').single()
      if (error) throw new Error(error.message)
      return { id: (data as { id: string }).id, quote_number: quoteNumber }
    },
    [companyId, currentProfileId, kams, preferredKamId],
  )

  const interactions = iq.data ?? []
  const tasks = tq.data ?? []
  const interactionsAll = iqa.data ?? []
  const tasksAll = tqa.data ?? []
  const upcomingTasks = useMemo(() => buildUpcomingTasks(tasks), [tasks])
  const historialEntries = useMemo(() => buildHistorialEntries(interactions, tasks), [interactions, tasks])
  const historialEntriesAll = useMemo(
    () => buildHistorialEntries(interactionsAll, tasksAll),
    [interactionsAll, tasksAll],
  )

  const buildTasksTabList = useCallback((list: CrmTask[]) => {
    const open = list
      .filter(t => t.status === 'pending' || t.status === 'in_progress')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    const closed = list
      .filter(t => t.status === 'completed' || t.status === 'cancelled')
      .sort(
        (a, b) =>
          new Date(b.completed_at ?? b.updated_at).getTime() -
          new Date(a.completed_at ?? a.updated_at).getTime(),
      )
    return [...open, ...closed]
  }, [])

  const tasksTabList = useMemo(() => buildTasksTabList(tasks), [tasks, buildTasksTabList])
  const tasksTabListAll = useMemo(() => buildTasksTabList(tasksAll), [tasksAll, buildTasksTabList])

  const quoteActivityCounts = useMemo(() => {
    if (!quotesForTab?.length) return null
    return buildQuoteCrmActivityCounts(
      quotesForTab.map(q => q.id),
      interactionsAll,
      tasksAll,
    )
  }, [quotesForTab, interactionsAll, tasksAll])

  const contactName = (id: string | null) => {
    if (!id) return null
    const c = contacts.find(x => x.id === id)
    return c ? `${c.first_name} ${c.last_name}` : null
  }

  const quoteRef = (id: string | null) => {
    if (!id) return null
    const q = quotes.find(x => x.id === id)
    return q?.quote_number ?? null
  }

  const loading = iq.isLoading || tq.isLoading
  const errorMsg = iq.error?.message ?? tq.error?.message ?? null

  const tabBtn = (id: CrmTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        'px-2 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px transition-colors',
        tab === id
          ? 'border-violet-600 text-violet-900 bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/80',
      )}
    >
      {label}
    </button>
  )

  return (
    <section id="seccion-crm-v2" className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-6">
      <div className="px-4 py-3 border-b bg-gradient-to-r from-violet-50/90 to-white flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList size={16} className="text-violet-600" />
          Actividad comercial
        </h2>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={CRM_ACTION_BTN}
            title="Historial completo"
            onClick={() => {
              setFullHistTab('historial')
              setHistorialCompletoOpen(true)
            }}
          >
            <ScrollText size={12} /> Historial
          </Button>
          {agendaHref ? (
            <Button type="button" size="sm" variant="outline" className={CRM_ACTION_BTN} title="Agenda" asChild>
              <Link to={agendaHref}>
                <CalendarDays size={12} /> Agenda
              </Link>
            </Button>
          ) : null}
        {canEdit && currentProfileId && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={CRM_ACTION_BTN}
              title="Registrar interacción"
              onClick={() => {
                setInteractionEditing(null)
                setInteractionModalOpen(true)
              }}
            >
              <Plus size={12} /> Interacción
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={CRM_ACTION_BTN}
              title="Nueva tarea"
              onClick={() => {
                setTaskEditing(null)
                setTaskOpen(true)
              }}
            >
              <ListTodo size={12} /> Tarea
            </Button>
          </>
        )}
        </div>
      </div>

      <div className="border-b border-gray-200 bg-gray-50/80 px-2 flex flex-wrap gap-0.5 items-end">
        {tabBtn('timeline', 'Historial')}
        {tabBtn('interactions', 'Interacciones')}
        {tabBtn('tasks', 'Tareas')}
        {quotesForTab != null ? tabBtn('quotes', 'Cotizaciones') : null}
      </div>

      <div className="p-4 min-h-[120px]">
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-3 bg-gray-100 rounded w-5/6" />
          </div>
        )}
        {!loading && errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMsg}</div>
        )}
        {!loading && !errorMsg && tab === 'timeline' && (
          <>
            {upcomingTasks.length === 0 && historialEntries.length === 0 ? (
              <p className="text-sm text-gray-400">Sin actividad de cuenta en este módulo.</p>
            ) : (
              <div
                className={cn(
                  'space-y-5',
                  upcomingTasks.length > 0 &&
                    historialEntries.length > 0 &&
                    'lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:space-y-0',
                )}
              >
                {upcomingTasks.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Próximas tareas</h3>
                    <ul className={cn('space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-lg', crmListScrollClass(upcomingTasks.length))}>
                      {upcomingTasks.map(t => {
                        const overdue =
                          t.status !== 'completed' &&
                          t.status !== 'cancelled' &&
                          new Date(t.due_date).getTime() < Date.now()
                        return (
                          <li
                            key={`up-${t.id}`}
                            role="button"
                            tabIndex={0}
                            className="flex gap-2 px-2 py-2 text-xs cursor-pointer hover:bg-violet-50/50 outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 rounded-sm"
                            onClick={() => setTaskDetail(t)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setTaskDetail(t)
                              }
                            }}
                          >
                            <span className="shrink-0 text-gray-400 pt-0.5">
                              <ListTodo size={12} className="text-violet-500" />
                            </span>
                            <div className="min-w-0 flex-1 min-h-[2.25rem] flex flex-col justify-center gap-0.5">
                                <p className="line-clamp-1 text-xs text-gray-800 leading-tight">
                                <span className="font-semibold text-gray-900">{formatTaskTitleForDisplay(t.title, t.description)}</span>
                                <span className="text-gray-400 font-normal"> · </span>
                                <span className="text-gray-600">vence {fmtCompactDate(t.due_date)}</span>
                                {overdue ? <span className="text-red-600 font-medium"> · vencida</span> : null}
                                <span className="text-gray-400"> · </span>
                                <span>{TASK_PRIORITY_LABEL[t.priority]}</span>
                              </p>
                              <p className="line-clamp-1 text-xs text-gray-500 leading-tight">
                                {t.description?.trim() || '\u00a0'}
                              </p>
                            </div>
                            <span className="shrink-0 self-center text-xs font-medium text-violet-700">Ver ›</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {historialEntries.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Historial</h3>
                    <ul className={cn('space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-lg', crmListScrollClass(historialEntries.length))}>
                      {historialEntries.map(entry => {
                        if (entry.kind === 'interaction') {
                          const c = entry.row
                          return (
                            <li
                              key={`h-i-${c.id}`}
                              role="button"
                              tabIndex={0}
                              className="flex gap-2 px-2 py-2 text-xs cursor-pointer hover:bg-violet-50/50 outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 rounded-sm"
                              onClick={() => setIxDetail(c)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  setIxDetail(c)
                                }
                              }}
                            >
                              <InteractionTypeIcon type={c.type} className="shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1 min-h-[2.25rem] flex flex-col justify-center gap-0.5">
                                  <p className="line-clamp-1 text-xs text-gray-800 leading-tight">
                                  <span className="font-semibold text-gray-900">{INTERACTION_TYPE_LABEL[c.type]}</span>
                                  <span className="text-gray-400 font-normal"> · </span>
                                  <span className="text-gray-600">hecho {fmtCompactDate(c.interaction_date)}</span>
                                  {c.outcome ? (
                                    <>
                                      <span className="text-gray-400"> · </span>
                                      <span className="text-gray-600">{OUTCOME_LABEL[c.outcome]}</span>
                                    </>
                                  ) : null}
                                </p>
                                <p className="line-clamp-1 text-xs text-gray-500 leading-tight">{c.notes?.trim() || '\u00a0'}</p>
                              </div>
                              <span className="shrink-0 self-center text-xs font-medium text-violet-700">Ver ›</span>
                            </li>
                          )
                        }
                        const t = entry.row
                        return (
                          <li
                            key={`h-t-${t.id}`}
                            role="button"
                            tabIndex={0}
                            className="flex gap-2 px-2 py-2 text-xs cursor-pointer hover:bg-violet-50/50 outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 rounded-sm"
                            onClick={() => setTaskDetail(t)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setTaskDetail(t)
                              }
                            }}
                          >
                            <span className="shrink-0 text-gray-400 pt-0.5">
                              {t.status === 'completed' ? (
                                <CheckCircle2 size={12} className="text-emerald-500" />
                              ) : (
                                <Circle size={12} className="text-gray-400" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1 min-h-[2.25rem] flex flex-col justify-center gap-0.5">
                                <p className="line-clamp-1 text-xs text-gray-800 leading-tight">
                                <span className="font-semibold text-gray-900">{formatTaskTitleForDisplay(t.title, t.description)}</span>
                                <span className="text-gray-400 font-normal"> · </span>
                                <span className="text-gray-600">{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                                <span className="text-gray-400"> · </span>
                                <span>vencía {fmtCompactDate(t.due_date)}</span>
                              </p>
                              <p className="line-clamp-1 text-xs text-gray-500 leading-tight">{t.description?.trim() || '\u00a0'}</p>
                            </div>
                            <span className="shrink-0 self-center text-xs font-medium text-violet-700">Ver ›</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!loading && !errorMsg && tab === 'interactions' && (
          <>
            {interactions.length === 0 ? (
              <p className="text-sm text-gray-400">Sin interacciones de cuenta.</p>
            ) : (
              <ul className={cn('space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-lg', crmListScrollClass(interactions.length))}>
                {interactions.map(c => (
                  <li
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    className="flex gap-2 px-2 py-2 text-xs cursor-pointer hover:bg-violet-50/50 outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 rounded-sm"
                    onClick={() => setIxDetail(c)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setIxDetail(c)
                      }
                    }}
                  >
                    <InteractionTypeIcon type={c.type} className="shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 min-h-[2.25rem] flex flex-col justify-center gap-0.5">
                      <p className="line-clamp-1 text-xs text-gray-800 leading-tight">
                        <span className="font-semibold text-gray-900">{INTERACTION_TYPE_LABEL[c.type]}</span>
                        <span className="text-gray-400 font-normal"> · </span>
                        <span className="text-gray-600">hecho {fmtCompactDate(c.interaction_date)}</span>
                        {contactName(c.contact_id) ? (
                          <>
                            <span className="text-gray-400"> · </span>
                            <span className="text-gray-600">{contactName(c.contact_id)}</span>
                          </>
                        ) : null}
                        {quoteRef(c.quote_id) ? (
                          <>
                            <span className="text-gray-400"> · </span>
                            <span className="font-mono text-gray-600">Cot. {quoteRef(c.quote_id)}</span>
                          </>
                        ) : null}
                        {c.outcome ? (
                          <>
                            <span className="text-gray-400"> · </span>
                            <span className="text-gray-600">{OUTCOME_LABEL[c.outcome]}</span>
                          </>
                        ) : null}
                      </p>
                      <p className="line-clamp-1 text-xs text-gray-500 leading-tight">{c.notes?.trim() || '\u00a0'}</p>
                    </div>
                    <span className="shrink-0 self-center text-xs font-medium text-violet-700">Ver ›</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!loading && !errorMsg && tab === 'tasks' && (
          <>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400">Sin tareas de cuenta.</p>
            ) : (
              <ul className={cn('space-y-0 divide-y divide-gray-100 border border-gray-100 rounded-lg', crmListScrollClass(tasksTabList.length))}>
                {tasksTabList.map(t => {
                  const assignee = kams.find(k => k.id === t.assigned_to)
                  const overdue =
                    t.status !== 'completed' &&
                    t.status !== 'cancelled' &&
                    new Date(t.due_date).getTime() < Date.now()
                  return (
                    <li
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      className="flex gap-2 px-2 py-2 text-xs cursor-pointer hover:bg-violet-50/50 outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 rounded-sm"
                      onClick={() => setTaskDetail(t)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setTaskDetail(t)
                        }
                      }}
                    >
                      <span className="shrink-0 text-gray-400 pt-0.5">
                        {t.status === 'completed' ? (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        ) : (
                          <ListTodo size={12} className="text-violet-500" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 min-h-[2.25rem] flex flex-col justify-center gap-0.5">
                        <p className="line-clamp-1 text-xs text-gray-800 leading-tight">
                          <span className="font-semibold text-gray-900">{formatTaskTitleForDisplay(t.title, t.description)}</span>
                          <span className="text-gray-400 font-normal"> · </span>
                          <span className={cn('text-gray-600', overdue && 'text-red-600 font-medium')}>
                            vence {fmtCompactDate(t.due_date)}
                            {overdue ? ' · vencida' : ''}
                          </span>
                          <span className="text-gray-400"> · </span>
                          <span>{TASK_PRIORITY_LABEL[t.priority]}</span>
                          <span className="text-gray-400"> · </span>
                          <span>{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                          {assignee ? (
                            <>
                              <span className="text-gray-400"> · </span>
                              <span className="text-gray-600">{assignee.full_name}</span>
                            </>
                          ) : null}
                        </p>
                        <p className="line-clamp-1 text-xs text-gray-500 leading-tight">{t.description?.trim() || '\u00a0'}</p>
                      </div>
                      <span className="shrink-0 self-center text-xs font-medium text-violet-700">Ver ›</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'quotes' && quotesForTab != null && (
          <>
            {canEdit ? (
              <div className="flex justify-end mb-3">
                <Button variant="outline" size="sm" className={CRM_ACTION_BTN} asChild>
                  <Link to="/quotes" state={{ openNew: true, companyId }}>
                    Nueva cotización
                  </Link>
                </Button>
              </div>
            ) : null}
            {quotesForTab.length === 0 ? (
              <p className="text-sm text-gray-400">Sin cotizaciones para esta empresa.</p>
            ) : (
              <div
                className={cn(
                  'overflow-x-auto',
                  quotesForTab.length > 6 && 'max-h-[min(26rem,70vh)] overflow-y-auto overflow-x-auto overscroll-contain',
                )}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="pb-2 pr-2">N°</th>
                      <th className="pb-2 pr-2">Título</th>
                      <th className="pb-2 pr-2">Estado</th>
                      <th className="pb-2 pr-2">KAM</th>
                      <th className="pb-2 pr-2 text-center">CRM</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {quotesForTab.map(q => {
                      const counts = quoteActivityCounts?.get(q.id)
                      const crmLabel =
                        counts && (counts.interactions > 0 || counts.tasks > 0)
                          ? `${counts.interactions} int. · ${counts.tasks} tar.`
                          : '—'
                      return (
                      <tr key={q.id} className="hover:bg-gray-50/80">
                        <td className="py-2 pr-2 font-mono text-xs text-gray-500">{q.quote_number}</td>
                        <td className="py-2 pr-2 max-w-[200px] truncate">{q.title ?? '—'}</td>
                        <td className="py-2 pr-2">
                          <span
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full font-medium',
                              QUOTE_STAGE_STYLE[q.stage] ?? 'bg-gray-100 text-gray-700',
                            )}
                          >
                            {QUOTE_STAGE_LABEL[q.stage] ?? q.stage}
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-gray-600 text-xs">{q.kamFullName ?? '—'}</td>
                        <td className="py-2 pr-2 text-center text-xs text-gray-600 tabular-nums" title="Interacciones y tareas vinculadas a esta cotización">
                          {iqa.isLoading || tqa.isLoading ? '…' : crmLabel}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-800">{fmtQuoteMoney(q.total ?? 0, q.currency)}</td>
                        <td className="py-2 pl-1">
                          <Link
                            to="/quotes"
                            state={{ highlightId: q.id }}
                            className="text-blue-600 hover:text-blue-800 inline-flex p-1"
                            title="Ver en cotizaciones"
                          >
                            <ChevronRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <CompanyCrmV2HistorialCompletoDialog
        open={historialCompletoOpen}
        onOpenChange={setHistorialCompletoOpen}
        tab={fullHistTab}
        onTabChange={setFullHistTab}
        historialEntries={historialEntries}
        historialEntriesAll={historialEntriesAll}
        interactions={interactions}
        interactionsAll={interactionsAll}
        tasksList={tasksTabList}
        tasksListAll={tasksTabListAll}
        kams={kams}
        contactName={contactName}
        quoteRef={quoteRef}
      />

      <CrmV2InteractionDialog
        open={interactionModalOpen}
        onOpenChange={v => {
          setInteractionModalOpen(v)
          if (!v) setInteractionEditing(null)
        }}
        editing={interactionEditing}
        contacts={contacts}
        quotes={quotes}
        kams={kams}
        currentProfileId={currentProfileId}
        isSubmitting={createIx.isPending || updateIx.isPending || createTask.isPending}
        onCreate={async (values, followUp, opts) => {
          if (!currentProfileId) return
          const created = await createIx.mutateAsync({ ...values, created_by: currentProfileId })
          let quoteForTask = followUp?.quote_id ?? null
          let nuevaCotizacionNum: string | null = null
          if (opts?.createDraftQuote) {
            const q = await createBlankQuote(values.contact_id ?? null)
            quoteForTask = q.id
            nuevaCotizacionNum = q.quote_number
            await updateIx.mutateAsync({ id: created.id, patch: { quote_id: quoteForTask } })
            onDataChange?.()
          }
          if (followUp) {
            await createTask.mutateAsync({
              title: followUp.title,
              description: followUp.description,
              due_date: followUp.due_date,
              priority: followUp.priority,
              assigned_to: followUp.assigned_to,
              contact_id: followUp.contact_id,
              quote_id: quoteForTask ?? followUp.quote_id,
              interaction_id: created.id,
              status: 'pending',
            })
          }
          if (nuevaCotizacionNum) {
            window.alert(
              `Se creó una cotización en borrador (${nuevaCotizacionNum}). Quedó vinculada a la interacción y a la tarea. Puede verla en la pestaña Cotizaciones de esta empresa o en el módulo Cotizaciones.`,
            )
          }
          setInteractionModalOpen(false)
          setInteractionEditing(null)
        }}
        onUpdate={async (id, patch, followUp) => {
          await updateIx.mutateAsync({ id, patch })
          if (followUp) {
            await createTask.mutateAsync({
              title: followUp.title,
              description: followUp.description,
              due_date: followUp.due_date,
              priority: followUp.priority,
              assigned_to: followUp.assigned_to,
              contact_id: followUp.contact_id,
              quote_id: followUp.quote_id,
              interaction_id: id,
              status: 'pending',
            })
          }
          setInteractionModalOpen(false)
          setInteractionEditing(null)
        }}
      />

      <CrmV2InteractionReadDialog
        interaction={ixDetail}
        open={Boolean(ixDetail)}
        onOpenChange={v => {
          if (!v) setIxDetail(null)
        }}
        contactName={contactName}
        quoteRef={quoteRef}
        canEdit={canEdit}
        onEdit={c => {
          setIxDetail(null)
          setInteractionEditing(c)
          setInteractionModalOpen(true)
        }}
        onDelete={
          canEdit
            ? async id => {
                await deleteIx.mutateAsync(id)
                setIxDetail(null)
              }
            : undefined
        }
        deletePending={deleteIx.isPending}
      />

      <CrmV2TaskReadDialog
        task={taskDetail}
        open={Boolean(taskDetail)}
        onOpenChange={v => {
          if (!v) setTaskDetail(null)
        }}
        kams={kams}
        contactName={contactName}
        quoteRef={quoteRef}
        canEdit={canEdit}
        onEdit={t => {
          setTaskDetail(null)
          setTaskEditing(t)
          setTaskOpen(true)
        }}
        onMarkDone={
          canEdit
            ? async id => {
                await updateTask.mutateAsync({
                  id,
                  patch: { status: 'completed', completed_at: new Date().toISOString() },
                })
              }
            : undefined
        }
        onDelete={
          canEdit
            ? async id => {
                await deleteTask.mutateAsync(id)
                setTaskDetail(null)
              }
            : undefined
        }
        updatePending={updateTask.isPending}
        deletePending={deleteTask.isPending}
      />

      <CrmV2TaskDialog
        open={taskOpen}
        onOpenChange={v => {
          setTaskOpen(v)
          if (!v) setTaskEditing(null)
        }}
        editingTask={taskEditing}
        contacts={contacts}
        quotes={quotes}
        kams={kams}
        defaultAssignedTo={currentProfileId ?? ''}
        isSubmitting={createTask.isPending || updateTask.isPending}
        onSubmit={async values => {
          try {
            if (taskEditing) {
              const patch: CrmTaskUpdate = {
                title: values.title,
                description: values.description,
                due_date: values.due_date,
                priority: values.priority,
                assigned_to: values.assigned_to,
                contact_id: values.contact_id,
                quote_id: values.quote_id,
              }
              if (values.status !== undefined) {
                patch.status = values.status
                if (values.status === 'completed') patch.completed_at = new Date().toISOString()
                else patch.completed_at = null
              }
              await updateTask.mutateAsync({ id: taskEditing.id, patch })
            } else {
              await createTask.mutateAsync({
                title: values.title,
                description: values.description,
                due_date: values.due_date,
                priority: values.priority,
                assigned_to: values.assigned_to,
                contact_id: values.contact_id,
                quote_id: values.quote_id,
                status: 'pending',
              })
            }
            setTaskOpen(false)
            setTaskEditing(null)
          } catch (e) {
            console.error(e)
            window.alert(e instanceof Error ? e.message : 'No se pudo guardar la tarea.')
          }
        }}
      />
    </section>
  )
}

/* ─── Formulario interacción (alta / edición + tarea según resultado) ─── */

export type InteractionFollowUpPayload = {
  title: string
  description: string | null
  due_date: string
  priority: CrmTaskPriority
  assigned_to: string
  contact_id: string | null
  quote_id: string | null
}

export type InteractionCreateOpts = {
  /** Crear cotización borrador y vincularla (resultado «Se envía cotización» sin cotización fija) */
  createDraftQuote?: boolean
}

const OUTCOMES_WITH_AUTO_TASK: InteractionOutcome[] = ['follow_up_later', 'not_interested', 'meeting_scheduled', 'quote_sent']

interface CrmV2InteractionDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: Interaction | null
  contacts: Contact[]
  quotes: CompanyCrmV2QuoteRef[]
  kams: Profile[]
  currentProfileId: string | undefined
  isSubmitting: boolean
  defaultContactId?: string
  fixedQuoteId?: string
  fixedQuoteNumber?: string
  onCreate: (
    values: {
      type: InteractionType
      title: string
      notes: string | null
      outcome: InteractionOutcome | null
      next_step: string | null
      contact_id: string | null
      quote_id: string | null
      interaction_date: string
      created_by: string
    },
    followUp: InteractionFollowUpPayload | null,
    opts?: InteractionCreateOpts,
  ) => Promise<void>
  onUpdate: (
    id: string,
    patch: {
      type: InteractionType
      title: string
      notes: string | null
      outcome: InteractionOutcome | null
      next_step: string | null
      contact_id: string | null
      quote_id: string | null
      interaction_date: string
    },
    followUp: InteractionFollowUpPayload | null,
  ) => Promise<void>
}

export function CrmV2InteractionDialog({
  open,
  onOpenChange,
  editing,
  contacts: contactList,
  quotes: quoteList,
  kams,
  currentProfileId,
  isSubmitting,
  defaultContactId,
  fixedQuoteId,
  fixedQuoteNumber,
  onCreate,
  onUpdate,
}: CrmV2InteractionDialogProps) {
  const [type, setType] = useState<InteractionType>('call')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState<InteractionOutcome | ''>('')
  const [contactId, setContactId] = useState('')
  const [quoteId, setQuoteId] = useState('')
  const [whenLocal, setWhenLocal] = useState(() => toDatetimeLocalValue(new Date().toISOString()))

  const [outcomeTaskDue, setOutcomeTaskDue] = useState(() => defaultTaskDueLocal())
  const [outcomeTaskPriority, setOutcomeTaskPriority] = useState<CrmTaskPriority>('medium')
  const [outcomeTaskAssigned, setOutcomeTaskAssigned] = useState('')

  const resetInteractionFields = () => {
    setType('call')
    setNotes('')
    setOutcome('')
    setContactId('')
    setQuoteId(fixedQuoteId ?? '')
    setWhenLocal(toDatetimeLocalValue(new Date().toISOString()))
  }

  const resetOutcomeTaskFields = () => {
    setOutcomeTaskDue(defaultTaskDueLocal())
    setOutcomeTaskPriority('medium')
    setOutcomeTaskAssigned(currentProfileId ?? '')
  }

  const hydrateFromInteraction = (row: Interaction) => {
    setType(row.type)
    setNotes(row.notes ?? '')
    setOutcome(row.outcome ?? '')
    setContactId(row.contact_id ?? '')
    setQuoteId(row.quote_id ?? fixedQuoteId ?? '')
    setWhenLocal(toDatetimeLocalValue(row.interaction_date))
    resetOutcomeTaskFields()
  }

  useEffect(() => {
    if (!open) return
    resetOutcomeTaskFields()
    if (editing) hydrateFromInteraction(editing)
    else {
      resetInteractionFields()
      if (defaultContactId) setContactId(defaultContactId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir o cambiar el registro editado
  }, [open, editing?.id])

  useEffect(() => {
    if (open) return
    resetInteractionFields()
    resetOutcomeTaskFields()
  }, [open])

  /** Al elegir resultado que exige tarea, ajustar fecha sugerida */
  useEffect(() => {
    if (outcome === 'not_interested') setOutcomeTaskDue(defaultTaskDueOneMonthLocal())
    else if (outcome && OUTCOMES_WITH_AUTO_TASK.includes(outcome)) setOutcomeTaskDue(defaultTaskDueLocal())
  }, [outcome])

  const activeContacts = contactList.filter(c => c.is_active)
  const assignable = kams.filter(k => k.is_active)

  const outcomeSelectKeys = useMemo((): (InteractionOutcome | '')[] => {
    const o = editing?.outcome
    if (o && !INTERACTION_FORM_OUTCOMES.includes(o)) return [...INTERACTION_FORM_OUTCOMES, o]
    return INTERACTION_FORM_OUTCOMES
  }, [editing?.outcome])

  const typeSelectKeys = useMemo((): InteractionType[] => {
    const t = editing?.type
    if (t && !INTERACTION_FORM_TYPES.includes(t)) return [...INTERACTION_FORM_TYPES, t]
    return INTERACTION_FORM_TYPES
  }, [editing?.type])

  const showOutcomeTaskBlock = Boolean(outcome && OUTCOMES_WITH_AUTO_TASK.includes(outcome as InteractionOutcome))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar interacción' : 'Registrar interacción'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Los cambios se guardan en la tabla `interactions`.'
              : 'Queda registrada la interacción. Si el resultado lo requiere, se crea también una tarea vinculada.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async e => {
            e.preventDefault()
            const interactionDateIso = fromDatetimeLocalValue(whenLocal)
            const autoTitle = buildAutoInteractionTitle(type, interactionDateIso, notes)
            const cId = contactId || null
            const selectedQuoteId = (fixedQuoteId ?? quoteId) || null
            const qIdForInteraction = selectedQuoteId
            const oc = outcome === '' ? null : outcome

            let follow: InteractionFollowUpPayload | null = null
            let opts: InteractionCreateOpts | undefined

            /** Solo en alta: evita duplicar tareas al guardar una interacción ya existente */
            const needsOutcomeTask =
              !editing && Boolean(oc && (OUTCOMES_WITH_AUTO_TASK as readonly string[]).includes(oc))

            if (needsOutcomeTask) {
              if (!outcomeTaskDue) {
                window.alert('Indique la fecha de vencimiento de la tarea.')
                return
              }
              if (!outcomeTaskAssigned) {
                window.alert('Indique el responsable de la tarea.')
                return
              }
              const draftQuote = oc === 'quote_sent' && !fixedQuoteId && !selectedQuoteId
              if (draftQuote) opts = { createDraftQuote: true }
              follow = {
                title: OUTCOME_LABEL[oc as InteractionOutcome],
                description: notes.trim() || null,
                due_date: fromDatetimeLocalValue(outcomeTaskDue),
                priority: outcomeTaskPriority,
                assigned_to: outcomeTaskAssigned,
                contact_id: cId,
                quote_id:
                  oc === 'quote_sent'
                    ? draftQuote
                      ? null
                      : selectedQuoteId
                    : selectedQuoteId,
              }
            }

            try {
              const basePatch = {
                type,
                title: autoTitle,
                notes: notes.trim() || null,
                outcome: oc,
                next_step: null as string | null,
                contact_id: cId,
                quote_id: qIdForInteraction,
                interaction_date: interactionDateIso,
              }
              if (editing) {
                await onUpdate(editing.id, basePatch, follow)
              } else {
                if (!currentProfileId) return
                await onCreate(
                  { ...basePatch, created_by: currentProfileId },
                  follow,
                  opts,
                )
              }
            } catch (err) {
              console.error(err)
              window.alert(err instanceof Error ? err.message : 'No se pudo guardar.')
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ix-type">Tipo</Label>
            <select
              id="ix-type"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              value={type}
              onChange={e => setType(e.target.value as InteractionType)}
            >
              {typeSelectKeys.map(t => (
                <option key={t} value={t}>
                  {INTERACTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ix-when">Fecha y hora del hecho</Label>
            <Input id="ix-when" type="datetime-local" value={whenLocal} onChange={e => setWhenLocal(e.target.value)} required />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ix-contact">Contacto (opcional)</Label>
              <select
                id="ix-contact"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={contactId}
                onChange={e => setContactId(e.target.value)}
              >
                <option value="">—</option>
                {activeContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>
            {fixedQuoteId ? (
              <div className="grid gap-1.5">
                <Label>Cotización</Label>
                <p className="text-sm text-gray-700 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono">
                  {fixedQuoteNumber ?? fixedQuoteId}
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="ix-quote">Cotización (opcional)</Label>
                <select
                  id="ix-quote"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={quoteId}
                  onChange={e => setQuoteId(e.target.value)}
                >
                  <option value="">—</option>
                  {quoteList.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quote_number} {q.title ? `— ${q.title}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ix-notes">Notas</Label>
            <Textarea id="ix-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="resize-y min-h-[72px]" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ix-outcome">Resultado (opcional)</Label>
            <select
              id="ix-outcome"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              value={outcome}
              onChange={e => setOutcome((e.target.value || '') as InteractionOutcome | '')}
            >
              {outcomeSelectKeys.map(o => (
                <option key={o || 'none'} value={o}>
                  {o === '' ? '—' : OUTCOME_LABEL[o]}
                </option>
              ))}
            </select>
          </div>

          {showOutcomeTaskBlock && !editing && (
            <div
              className={cn(
                'rounded-lg border border-gray-200 bg-gray-50/80 p-3 grid gap-2',
                outcome === 'quote_sent' && !fixedQuoteId && !(quoteId || '').trim() && 'border-amber-200 bg-amber-50/90',
              )}
            >
              {outcome === 'quote_sent' && !fixedQuoteId && !(quoteId || '').trim() ? (
                <p className="text-xs font-medium text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="shrink-0" size={14} aria-hidden />
                  Se creará cotización en borrador y tarea de seguimiento.
                </p>
              ) : null}
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="ix-ot-due">Vencimiento de la tarea</Label>
                  <Input
                    id="ix-ot-due"
                    type="datetime-local"
                    value={outcomeTaskDue}
                    onChange={e => setOutcomeTaskDue(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ix-ot-priority">Prioridad</Label>
                  <select
                    id="ix-ot-priority"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                    value={outcomeTaskPriority}
                    onChange={e => setOutcomeTaskPriority(e.target.value as CrmTaskPriority)}
                  >
                    {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ix-ot-assign">Responsable de la tarea</Label>
                <select
                  id="ix-ot-assign"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={outcomeTaskAssigned}
                  onChange={e => setOutcomeTaskAssigned(e.target.value)}
                >
                  {assignable.length === 0 ? (
                    <option value="">Sin perfiles</option>
                  ) : (
                    assignable.map(k => (
                      <option key={k.id} value={k.id}>
                        {k.full_name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={(!editing && !currentProfileId) || isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin size-4" /> : editing ? 'Guardar cambios' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CrmV2InteractionReadDialog({
  interaction,
  open,
  onOpenChange,
  contactName,
  quoteRef,
  canEdit,
  onEdit,
  onDelete,
  deletePending,
}: {
  interaction: Interaction | null
  open: boolean
  onOpenChange: (v: boolean) => void
  contactName: (id: string | null) => string | null
  quoteRef: (id: string | null) => string | null
  canEdit: boolean
  onEdit: (row: Interaction) => void
  /** Eliminar desde el detalle (opcional) */
  onDelete?: (id: string) => void
  deletePending?: boolean
}) {
  const c = interaction
  return (
    <Dialog open={open && Boolean(c)} onOpenChange={onOpenChange}>
      {c ? (
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-8">
              {INTERACTION_TYPE_LABEL[c.type]} · {fmtCompactDate(c.interaction_date)}
            </DialogTitle>
            <DialogDescription>
              {INTERACTION_TYPE_LABEL[c.type]} · {fmtDateTime(c.interaction_date)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            {contactName(c.contact_id) && (
              <p>
                <span className="text-gray-500">Contacto:</span> {contactName(c.contact_id)}
              </p>
            )}
            {quoteRef(c.quote_id) && (
              <p>
                <span className="text-gray-500">Cotización:</span>{' '}
                <span className="font-mono">{quoteRef(c.quote_id)}</span>
              </p>
            )}
            {c.outcome && (
              <p>
                <span className="text-gray-500">Resultado:</span> {OUTCOME_LABEL[c.outcome]}
              </p>
            )}
            <div>
              <p className="text-gray-500 text-xs mb-1">Notas</p>
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">{c.notes?.trim() ? c.notes : '—'}</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            {canEdit && onDelete && (
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                onClick={() => {
                  if (!window.confirm('¿Eliminar esta interacción?')) return
                  onDelete(c.id)
                }}
              >
                Eliminar
              </Button>
            )}
            {canEdit && (
              <Button
                type="button"
                onClick={() => {
                  onEdit(c)
                }}
              >
                <Pencil size={14} className="mr-1" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

export function CrmV2TaskReadDialog({
  task,
  open,
  onOpenChange,
  kams,
  contactName,
  quoteRef,
  canEdit,
  onEdit,
  onMarkDone,
  onDelete,
  updatePending,
  deletePending,
}: {
  task: CrmTask | null
  open: boolean
  onOpenChange: (v: boolean) => void
  kams: Profile[]
  contactName: (id: string | null) => string | null
  quoteRef: (id: string | null) => string | null
  canEdit?: boolean
  onEdit?: (row: CrmTask) => void
  onMarkDone?: (id: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  updatePending?: boolean
  deletePending?: boolean
}) {
  const t = task
  const assignee = t ? kams.find(k => k.id === t.assigned_to) : null
  return (
    <Dialog open={open && Boolean(t)} onOpenChange={onOpenChange}>
      {t ? (
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-8">{formatTaskTitleForDisplay(t.title, t.description)}</DialogTitle>
            <DialogDescription>
              {TASK_PRIORITY_LABEL[t.priority]} · {TASK_STATUS_LABEL[t.status] ?? t.status} · vence {fmtDateTime(t.due_date)}
              {t.completed_at && t.status === 'completed' && ` · cerrada ${fmtDateTime(t.completed_at)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            {assignee && (
              <p>
                <span className="text-gray-500">Responsable:</span> {assignee.full_name}
              </p>
            )}
            {contactName(t.contact_id) && (
              <p>
                <span className="text-gray-500">Contacto:</span> {contactName(t.contact_id)}
              </p>
            )}
            {quoteRef(t.quote_id) && (
              <p>
                <span className="text-gray-500">Cotización:</span>{' '}
                <span className="font-mono">{quoteRef(t.quote_id)}</span>
              </p>
            )}
            <div>
              <p className="text-gray-500 text-xs mb-1">Descripción</p>
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
                {t.description?.trim() ? t.description : '—'}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            {canEdit && onDelete && (
              <Button
                type="button"
                variant="destructive"
                disabled={deletePending}
                onClick={() => {
                  if (!window.confirm('¿Eliminar esta tarea?')) return
                  void Promise.resolve(onDelete(t.id)).then(() => onOpenChange(false))
                }}
              >
                Eliminar
              </Button>
            )}
            {canEdit && onMarkDone && t.status !== 'completed' && t.status !== 'cancelled' && (
              <Button
                type="button"
                variant="secondary"
                disabled={updatePending}
                onClick={() => void Promise.resolve(onMarkDone(t.id)).then(() => onOpenChange(false))}
              >
                Marcar hecha
              </Button>
            )}
            {canEdit && onEdit && (
              <Button
                type="button"
                onClick={() => {
                  onEdit(t)
                }}
              >
                <Pencil size={14} className="mr-1" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

interface CrmV2TaskDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Si viene informada, el diálogo actúa en modo edición */
  editingTask?: CrmTask | null
  contacts: Contact[]
  quotes: CompanyCrmV2QuoteRef[]
  kams: Profile[]
  defaultAssignedTo: string
  isSubmitting: boolean
  fixedQuoteId?: string
  fixedQuoteNumber?: string
  onSubmit: (values: {
    title: string
    description: string | null
    due_date: string
    priority: CrmTaskPriority
    assigned_to: string
    contact_id: string | null
    quote_id: string | null
    status?: CrmTaskStatus
  }) => Promise<void>
}

export function CrmV2TaskDialog({
  open,
  onOpenChange,
  editingTask = null,
  contacts: contactList,
  quotes: quoteList,
  kams,
  defaultAssignedTo,
  isSubmitting,
  fixedQuoteId,
  fixedQuoteNumber,
  onSubmit,
}: CrmV2TaskDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueLocal, setDueLocal] = useState(() => toDatetimeLocalValue(new Date().toISOString()))
  const [priority, setPriority] = useState<CrmTaskPriority>('medium')
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo)
  const [contactId, setContactId] = useState('')
  const [quoteId, setQuoteId] = useState('')
  const [status, setStatus] = useState<CrmTaskStatus>('pending')

  const reset = () => {
    setTitle('')
    setDescription('')
    setDueLocal(toDatetimeLocalValue(new Date().toISOString()))
    setPriority('medium')
    setAssignedTo(defaultAssignedTo)
    setContactId('')
    setQuoteId(fixedQuoteId ?? '')
    setStatus('pending')
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  useEffect(() => {
    if (!open) return
    if (editingTask) {
      setTitle(editingTask.title)
      setDescription(editingTask.description ?? '')
      setDueLocal(toDatetimeLocalValue(editingTask.due_date))
      setPriority(editingTask.priority)
      setAssignedTo(editingTask.assigned_to)
      setContactId(editingTask.contact_id ?? '')
      setQuoteId(editingTask.quote_id ?? fixedQuoteId ?? '')
      setStatus(editingTask.status)
    } else {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reset` depende de defaultAssignedTo; rehidratar solo al abrir o cambiar tarea
  }, [open, editingTask?.id, defaultAssignedTo, fixedQuoteId])

  const activeContacts = contactList.filter(c => c.is_active)
  const assignable = kams.filter(k => k.is_active)
  const isEdit = Boolean(editingTask)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Los cambios se guardan en la tabla `tasks`.'
              : 'Queda en la tabla `tasks` y aparece en la pestaña Tareas y en el Historial.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={e => {
            e.preventDefault()
            if (!title.trim() || !assignedTo) return
            void onSubmit({
              title: title.trim(),
              description: description.trim() || null,
              due_date: fromDatetimeLocalValue(dueLocal),
              priority,
              assigned_to: assignedTo,
              contact_id: contactId || null,
              quote_id: (fixedQuoteId ?? quoteId) || null,
              ...(isEdit ? { status } : {}),
            })
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="tk-title">Título de la tarea</Label>
            <Input id="tk-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={500} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tk-desc">Descripción</Label>
            <Textarea
              id="tk-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="resize-y min-h-[56px]"
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tk-due">Vencimiento</Label>
              <Input id="tk-due" type="datetime-local" value={dueLocal} onChange={e => setDueLocal(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tk-priority">Prioridad</Label>
              <select
                id="tk-priority"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={priority}
                onChange={e => setPriority(e.target.value as CrmTaskPriority)}
              >
                {(['low', 'medium', 'high', 'urgent'] as const).map(p => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {isEdit && (
            <div className="grid gap-1.5">
              <Label htmlFor="tk-status">Estado</Label>
              <select
                id="tk-status"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={status}
                onChange={e => setStatus(e.target.value as CrmTaskStatus)}
              >
                {(['pending', 'in_progress', 'completed', 'cancelled'] as const).map(s => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="tk-assign">Responsable</Label>
            <select
              id="tk-assign"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              required
            >
              {assignable.length === 0 ? (
                <option value="">Sin perfiles</option>
              ) : (
                assignable.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.full_name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tk-contact">Contacto (opcional)</Label>
              <select
                id="tk-contact"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                value={contactId}
                onChange={e => setContactId(e.target.value)}
              >
                <option value="">—</option>
                {activeContacts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>
            {fixedQuoteId ? (
              <div className="grid gap-1.5">
                <Label>Cotización</Label>
                <p className="text-sm text-gray-700 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 font-mono">
                  {fixedQuoteNumber ?? fixedQuoteId}
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="tk-quote">Cotización (opcional)</Label>
                <select
                  id="tk-quote"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={quoteId}
                  onChange={e => setQuoteId(e.target.value)}
                >
                  <option value="">—</option>
                  {quoteList.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quote_number} {q.title ? `— ${q.title}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || !assignedTo || isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin size-4" /> : isEdit ? 'Guardar cambios' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
