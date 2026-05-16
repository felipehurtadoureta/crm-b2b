/**
 * Seguimiento comercial v2 en cotización: misma UX que la ficha empresa, filtrado por `quote_id`.
 */
import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, ClipboardList, ListTodo, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  buildHistorialEntries,
  buildUpcomingTasks,
  crmListScrollClass,
  fmtCompactDate,
  formatTaskTitleForDisplay,
  INTERACTION_TYPE_LABEL,
  InteractionTypeIcon,
  OUTCOME_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
} from '@/lib/crmV2Display'
import {
  CrmV2InteractionDialog,
  CrmV2InteractionReadDialog,
  CrmV2TaskDialog,
  CrmV2TaskReadDialog,
} from '@/components/companies/CompanyCrmV2Section'
import type { CompanyCrmV2QuoteRef } from '@/components/companies/CompanyCrmV2Section'
import { useCreateInteraction, useDeleteInteraction, useInteractionsByQuote, useUpdateInteraction } from '@/hooks/useInteractions'
import { useCreateTask, useDeleteTask, useTasksByQuote, useUpdateTask } from '@/hooks/useTasks'
import type { Contact, CrmTask, CrmTaskUpdate, Interaction, Profile } from '@/types'

type Tab = 'timeline' | 'interactions' | 'tasks'

const CRM_ACTION_BTN =
  'h-8 px-3 text-xs font-medium gap-1.5 shrink-0 border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100'

export interface QuoteCrmFollowUpSectionProps {
  quoteId: string
  quoteNumber: string
  companyId: string
  formContactId: string
  contacts: Contact[]
  kams: Profile[]
  currentProfileId: string | undefined
  readonly: boolean
}

export default function QuoteCrmFollowUpSection({
  quoteId,
  quoteNumber,
  companyId,
  formContactId,
  contacts,
  kams,
  currentProfileId,
  readonly,
}: QuoteCrmFollowUpSectionProps) {
  const [tab, setTab] = useState<Tab>('timeline')
  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  const [interactionEditing, setInteractionEditing] = useState<Interaction | null>(null)
  const [ixDetail, setIxDetail] = useState<Interaction | null>(null)
  const [taskDetail, setTaskDetail] = useState<CrmTask | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<CrmTask | null>(null)

  const quoteOpts = { quoteId } as const
  const iq = useInteractionsByQuote(quoteId, Boolean(companyId))
  const tq = useTasksByQuote(quoteId, Boolean(companyId))

  const createIx = useCreateInteraction(companyId, quoteOpts)
  const updateIx = useUpdateInteraction(companyId, quoteOpts)
  const deleteIx = useDeleteInteraction(companyId, quoteOpts)
  const createTask = useCreateTask(companyId, quoteOpts)
  const updateTask = useUpdateTask(companyId, quoteOpts)
  const deleteTask = useDeleteTask(companyId, quoteOpts)

  const interactions = iq.data ?? []
  const tasks = tq.data ?? []
  const upcomingTasks = useMemo(() => buildUpcomingTasks(tasks), [tasks])
  const historialEntries = useMemo(() => buildHistorialEntries(interactions, tasks), [interactions, tasks])

  const tasksTabList = useMemo(() => {
    const open = tasks
      .filter(t => t.status === 'pending' || t.status === 'in_progress')
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    const closed = tasks
      .filter(t => t.status === 'completed' || t.status === 'cancelled')
      .sort(
        (a, b) =>
          new Date(b.completed_at ?? b.updated_at).getTime() -
          new Date(a.completed_at ?? a.updated_at).getTime(),
      )
    return [...open, ...closed]
  }, [tasks])

  const quotesForDialogs: CompanyCrmV2QuoteRef[] = useMemo(
    () => [{ id: quoteId, quote_number: quoteNumber, title: null }],
    [quoteId, quoteNumber],
  )

  const contactName = (id: string | null) => {
    if (!id) return null
    const c = contacts.find(x => x.id === id)
    return c ? `${c.first_name} ${c.last_name}` : null
  }

  const quoteRef = (id: string | null) => (id === quoteId ? quoteNumber : null)

  const loading = iq.isLoading || tq.isLoading
  const errorMsg = iq.error?.message ?? tq.error?.message ?? null
  const canEdit = !readonly && Boolean(currentProfileId)

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        'px-2.5 py-1.5 text-xs font-medium rounded-t-md border-b-2 -mb-px transition-colors',
        tab === id
          ? 'border-violet-600 text-violet-900 bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/80',
      )}
    >
      {label}
    </button>
  )

  if (!companyId) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
        Seleccione una empresa para ver el seguimiento comercial (módulo nuevo).
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-b from-violet-50/40 to-white overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <ClipboardList size={16} className="text-violet-600 shrink-0" />
          Seguimiento comercial
        </h3>
        {canEdit && currentProfileId ? (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={CRM_ACTION_BTN}
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
              onClick={() => {
                setTaskEditing(null)
                setTaskOpen(true)
              }}
            >
              <ListTodo size={12} /> Tarea
            </Button>
          </div>
        ) : null}
      </div>

      <div className="border-b border-gray-200 bg-gray-50/80 px-1.5 flex flex-wrap gap-0.5 items-end">
        {tabBtn('timeline', 'Historial')}
        {tabBtn('interactions', 'Interacciones')}
        {tabBtn('tasks', 'Tareas')}
      </div>

      <div className="p-3 min-h-[100px]">
        {loading && (
          <div className="space-y-2 animate-pulse">
            <div className="h-2.5 bg-gray-100 rounded w-3/4" />
            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
          </div>
        )}
        {!loading && errorMsg && (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">{errorMsg}</div>
        )}
        {!loading && !errorMsg && tab === 'timeline' && (
          <>
            {upcomingTasks.length === 0 && historialEntries.length === 0 ? (
              <p className="text-xs text-gray-400">Sin registros de seguimiento para esta cotización.</p>
            ) : (
              <div
                className={cn(
                  'space-y-4',
                  upcomingTasks.length > 0 &&
                    historialEntries.length > 0 &&
                    'lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start lg:space-y-0',
                )}
              >
                {upcomingTasks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Próximas tareas</h4>
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
                              <p className="line-clamp-1 text-xs text-gray-500 leading-tight">{t.description?.trim() || '\u00a0'}</p>
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
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Historial</h4>
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
              <p className="text-xs text-gray-400">Sin interacciones.</p>
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
              <p className="text-xs text-gray-400">Sin tareas.</p>
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
      </div>

      <CrmV2InteractionDialog
        open={interactionModalOpen}
        onOpenChange={v => {
          setInteractionModalOpen(v)
          if (!v) setInteractionEditing(null)
        }}
        editing={interactionEditing}
        contacts={contacts}
        quotes={quotesForDialogs}
        kams={kams}
        currentProfileId={currentProfileId}
        fixedQuoteId={quoteId}
        fixedQuoteNumber={quoteNumber}
        defaultContactId={formContactId || undefined}
        isSubmitting={createIx.isPending || updateIx.isPending || createTask.isPending || updateTask.isPending}
        onCreate={async (values, followUp, _opts) => {
          if (!currentProfileId) return
          const created = await createIx.mutateAsync({
            ...values,
            quote_id: quoteId,
            contact_id: values.contact_id ?? (formContactId || null),
            created_by: currentProfileId,
          })
          if (followUp) {
            await createTask.mutateAsync({
              title: followUp.title,
              description: followUp.description,
              due_date: followUp.due_date,
              priority: followUp.priority,
              assigned_to: followUp.assigned_to,
              contact_id: followUp.contact_id,
              quote_id: quoteId,
              interaction_id: created.id,
              status: 'pending',
            })
          }
          setInteractionModalOpen(false)
          setInteractionEditing(null)
        }}
        onUpdate={async (id, patch, followUp) => {
          await updateIx.mutateAsync({ id, patch: { ...patch, quote_id: quoteId } })
          if (followUp) {
            await createTask.mutateAsync({
              title: followUp.title,
              description: followUp.description,
              due_date: followUp.due_date,
              priority: followUp.priority,
              assigned_to: followUp.assigned_to,
              contact_id: followUp.contact_id,
              quote_id: quoteId,
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
        quotes={quotesForDialogs}
        kams={kams}
        defaultAssignedTo={currentProfileId ?? ''}
        fixedQuoteId={quoteId}
        fixedQuoteNumber={quoteNumber}
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
                quote_id: quoteId,
              }
              if (values.status !== undefined) {
                patch.status = values.status
                if (values.status === 'completed') patch.completed_at = new Date().toISOString()
                else patch.completed_at = null
              }
              await updateTask.mutateAsync({ id: taskEditing.id, patch })
            } else {
              await createTask.mutateAsync({
                ...values,
                quote_id: quoteId,
                contact_id: values.contact_id ?? (formContactId || null),
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
    </div>
  )
}
