/**
 * Modal ancho, solo lectura: documento con todo el historial CRM (pestañas sin acciones).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  INTERACTION_TYPE_LABEL,
  OUTCOME_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  fmtDateTime,
  formatTaskTitleForDisplay,
  type HistorialEntry,
} from '@/lib/crmV2Display'
import type { CrmTask, Interaction, Profile } from '@/types'

export type FullHistorialTab = 'historial' | 'interactions' | 'tasks'

/** Alcance del historial completo: solo cuenta o toda la empresa (incluye cotizaciones). */
export type HistorialScope = 'account' | 'all'

export interface CompanyCrmV2HistorialCompletoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: FullHistorialTab
  onTabChange: (t: FullHistorialTab) => void
  historialEntries: HistorialEntry[]
  historialEntriesAll: HistorialEntry[]
  interactions: Interaction[]
  interactionsAll: Interaction[]
  tasksList: CrmTask[]
  tasksListAll: CrmTask[]
  kams: Profile[]
  contactName: (id: string | null) => string | null
  quoteRef: (id: string | null) => string | null
}

function tabBtn(
  id: FullHistorialTab,
  label: string,
  current: FullHistorialTab,
  onPick: (t: FullHistorialTab) => void,
) {
  return (
    <button
      key={id}
      type="button"
      onClick={() => onPick(id)}
      className={cn(
        'px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 -mb-px transition-colors',
        current === id
          ? 'border-violet-600 text-violet-900 bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50/80',
      )}
    >
      {label}
    </button>
  )
}

function scopeBtn(
  id: HistorialScope,
  label: string,
  current: HistorialScope,
  onPick: (s: HistorialScope) => void,
) {
  return (
    <button
      key={id}
      type="button"
      onClick={() => onPick(id)}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        current === id ? 'bg-violet-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
      )}
    >
      {label}
    </button>
  )
}

function kamLabel(kams: Profile[], id: string | null) {
  if (!id) return '—'
  return kams.find(k => k.id === id)?.full_name ?? id
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-0.5 text-[12px] border-b border-gray-100 py-1.5 last:border-b-0">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 min-w-0 break-words">{children}</dd>
    </div>
  )
}

function InteractionDocument({
  c,
  kams,
  contactName,
  quoteRef,
}: {
  c: Interaction
  kams: Profile[]
  contactName: (id: string | null) => string | null
  quoteRef: (id: string | null) => string | null
}) {
  return (
    <article className="border-b border-gray-200 pb-8 mb-8 last:mb-0 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold text-gray-900 tracking-tight">
        {INTERACTION_TYPE_LABEL[c.type]}
        {c.title?.trim() ? ` — ${c.title.trim()}` : ''}
      </h3>
      <dl className="mt-3 border border-gray-100 rounded-lg bg-gray-50/50 px-3 py-1">
        <MetaRow label="Fecha de la interacción">{fmtDateTime(c.interaction_date)}</MetaRow>
        <MetaRow label="Fecha de registro">{fmtDateTime(c.created_at)}</MetaRow>
        <MetaRow label="Contacto">{contactName(c.contact_id) ?? '—'}</MetaRow>
        <MetaRow label="Cotización">{quoteRef(c.quote_id) ?? '—'}</MetaRow>
        <MetaRow label="Resultado">{c.outcome ? OUTCOME_LABEL[c.outcome] : '—'}</MetaRow>
        <MetaRow label="Registrado por">{kamLabel(kams, c.created_by)}</MetaRow>
        <MetaRow label="Id. interno">
          <span className="font-mono text-[11px] text-gray-500">{c.id}</span>
        </MetaRow>
      </dl>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Notas</p>
        <div className="mt-1.5 rounded-md border border-gray-100 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-gray-900 whitespace-pre-wrap">
          {c.notes?.trim() ? c.notes : '—'}
        </div>
      </div>
    </article>
  )
}

function TaskDocument({
  t,
  kams,
  contactName,
  quoteRef,
}: {
  t: CrmTask
  kams: Profile[]
  contactName: (id: string | null) => string | null
  quoteRef: (id: string | null) => string | null
}) {
  return (
    <article className="border-b border-gray-200 pb-8 mb-8 last:mb-0 last:border-b-0 last:pb-0">
      <h3 className="text-sm font-semibold text-gray-900 tracking-tight">{formatTaskTitleForDisplay(t.title, t.description)}</h3>
      <dl className="mt-3 border border-gray-100 rounded-lg bg-gray-50/50 px-3 py-1">
        <MetaRow label="Estado">{TASK_STATUS_LABEL[t.status] ?? t.status}</MetaRow>
        <MetaRow label="Prioridad">{TASK_PRIORITY_LABEL[t.priority]}</MetaRow>
        <MetaRow label="Vencimiento">{fmtDateTime(t.due_date)}</MetaRow>
        <MetaRow label="Creada">{fmtDateTime(t.created_at)}</MetaRow>
        <MetaRow label="Actualizada">{fmtDateTime(t.updated_at)}</MetaRow>
        {t.status === 'completed' && t.completed_at && (
          <MetaRow label="Completada">{fmtDateTime(t.completed_at)}</MetaRow>
        )}
        <MetaRow label="Responsable">{kamLabel(kams, t.assigned_to)}</MetaRow>
        <MetaRow label="Contacto">{contactName(t.contact_id) ?? '—'}</MetaRow>
        <MetaRow label="Cotización">{quoteRef(t.quote_id) ?? '—'}</MetaRow>
        <MetaRow label="Id. interno">
          <span className="font-mono text-[11px] text-gray-500">{t.id}</span>
        </MetaRow>
      </dl>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Descripción</p>
        <div className="mt-1.5 rounded-md border border-gray-100 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-gray-900 whitespace-pre-wrap">
          {t.description?.trim() ? t.description : '—'}
        </div>
      </div>
    </article>
  )
}

export default function CompanyCrmV2HistorialCompletoDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  historialEntries,
  historialEntriesAll,
  interactions,
  interactionsAll,
  tasksList,
  tasksListAll,
  kams,
  contactName,
  quoteRef,
}: CompanyCrmV2HistorialCompletoDialogProps) {
  const [scope, setScope] = useState<HistorialScope>('account')

  useEffect(() => {
    if (open) setScope('account')
  }, [open])

  const activeHistorial = scope === 'account' ? historialEntries : historialEntriesAll
  const activeInteractions = scope === 'account' ? interactions : interactionsAll
  const activeTasks = scope === 'account' ? tasksList : tasksListAll

  const interactionsSorted = useMemo(
    () =>
      [...activeInteractions].sort(
        (a, b) => new Date(b.interaction_date).getTime() - new Date(a.interaction_date).getTime(),
      ),
    [activeInteractions],
  )

  const emptyHistorial =
    scope === 'account'
      ? 'No hay actividad de cuenta en el historial unificado.'
      : 'No hay entradas en el historial unificado.'
  const emptyInteractions =
    scope === 'account' ? 'No hay interacciones de cuenta registradas.' : 'No hay interacciones registradas.'
  const emptyTasks = scope === 'account' ? 'No hay tareas de cuenta registradas.' : 'No hay tareas registradas.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          'flex max-h-[88vh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] flex-col gap-0 overflow-hidden p-0',
          'sm:max-w-[min(96vw,56rem)]',
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-gray-200 px-5 py-4 text-left">
          <DialogTitle className="text-base">Historial completo (solo lectura)</DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            {scope === 'account'
              ? 'Solo actividad de la cuenta (sin cotización vinculada). Sin edición; use la ficha para modificar.'
              : 'Toda la actividad de la empresa, incluida la vinculada a cotizaciones. Sin edición; use la ficha para modificar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex gap-1">
            {scopeBtn('account', 'Cuenta', scope, setScope)}
            {scopeBtn('all', 'Todas', scope, setScope)}
          </div>
        </div>

        <div className="shrink-0 border-b border-gray-200 bg-gray-50/80 px-2">
          <div className="flex flex-wrap gap-0.5">
            {tabBtn('historial', 'Historial', tab, onTabChange)}
            {tabBtn('interactions', 'Interacciones', tab, onTabChange)}
            {tabBtn('tasks', 'Tareas', tab, onTabChange)}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-100/60 px-3 py-4 sm:px-5">
          <div
            className={cn(
              'mx-auto max-w-none rounded-lg border border-gray-200 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-10',
              'text-[13px] leading-relaxed text-gray-900',
            )}
          >
            {tab === 'historial' && (
              <>
                {activeHistorial.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10">{emptyHistorial}</p>
                ) : (
                  activeHistorial.map(entry => (
                    <div key={entry.kind === 'interaction' ? `i-${entry.row.id}` : `t-${entry.row.id}`}>
                      {entry.kind === 'interaction' ? (
                        <InteractionDocument
                          c={entry.row}
                          kams={kams}
                          contactName={contactName}
                          quoteRef={quoteRef}
                        />
                      ) : (
                        <TaskDocument t={entry.row} kams={kams} contactName={contactName} quoteRef={quoteRef} />
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {tab === 'interactions' && (
              <>
                {interactionsSorted.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10">{emptyInteractions}</p>
                ) : (
                  interactionsSorted.map(c => (
                    <InteractionDocument
                      key={c.id}
                      c={c}
                      kams={kams}
                      contactName={contactName}
                      quoteRef={quoteRef}
                    />
                  ))
                )}
              </>
            )}

            {tab === 'tasks' && (
              <>
                {activeTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10">{emptyTasks}</p>
                ) : (
                  activeTasks.map(t => (
                    <TaskDocument key={t.id} t={t} kams={kams} contactName={contactName} quoteRef={quoteRef} />
                  ))
                )}
              </>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-gray-50/80 px-4 py-2">
          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
