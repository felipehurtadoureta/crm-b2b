/**
 * Fila vista mes agenda: empresa y cotización con enlaces, + muestra sólo texto de detalle; acciones en una línea horizontal.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, ListTodo, Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  bucketPendiente,
  type PendienteItem,
} from '@/lib/agendaPendientes'
import { fmtCompactDate } from '@/lib/crmV2Display'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  cfInvoicesQueryKey,
  markInvoiceAsPaid,
  syncQuoteFollowupRemindersForStage,
  updateCommercialReminderDueDate,
  invalidateQuoteFollowupAgendaQueries,
} from '@/hooks/useCommercialFollowups'
import { normalizeQuoteStage, type Profile, type QuoteStage } from '@/types'

const FUENTE_LABEL: Record<PendienteItem['fuente'], string> = {
  quote_close: 'Cierre cotización',
  crm_task: 'Tarea CRM',
  followup: 'Seguimiento',
}

function followupDotClass(subject: PendienteItem['followupSubject']) {
  if (subject === 'company') return 'bg-blue-500'
  if (subject === 'quote') return 'bg-green-500'
  if (subject === 'invoice') return 'bg-red-600'
  return 'bg-gray-400'
}

function fechaMostrada(p: PendienteItem) {
  const iso = p.detalleFechaIso?.trim() || (p.fecha.length === 10 ? `${p.fecha}T12:00:00` : p.fecha)
  return fmtCompactDate(iso)
}

/** Ruta ficha empresa (misma convención que el listado de agenda). */
function linkFichaEmpresa(p: PendienteItem) {
  return p.fuente === 'followup'
    ? `/companies/${p.companyId}/v2#seccion-seguimientos`
    : `/companies/${p.companyId}/v2`
}

function linkCotizacion(quoteId: string) {
  return `/quotes?quoteId=${encodeURIComponent(quoteId)}&view=kanban`
}

/** Texto del enlace a cotización cuando hay `quoteId`. */
function etiquetaEnlaceCotizacion(p: PendienteItem): string {
  if (p.quoteNumber) {
    const n = String(p.quoteNumber).trim()
    return /^Cot[\s.]/i.test(n) ? n : `Cot. ${n}`
  }
  if (p.fuente === 'quote_close') {
    const parte = p.subtitulo.split(' · ')[0]?.trim()
    return parte || 'Cotización'
  }
  if (p.fuente === 'followup' && p.followupSubject === 'quote') {
    const m =
      p.titulo.match(/(?:Reunión|Mail|Llamado) · Seguimiento · Cotización\s*(.*)$/i) ??
      p.titulo.match(/Seguimiento · Cotización\s*(.*)$/i)
    const num = m?.[1]?.trim()
    return num ? `Cot. ${num}` : 'Cotización'
  }
  return 'Cotización'
}

function puedeEditarCotizacion(profile: Profile | null | undefined, quoteKamId?: string | null) {
  if (!profile) return false
  if (profile.role === 'super_admin') return true
  if (profile.role === 'kam' && quoteKamId && profile.id === quoteKamId) return true
  return false
}

function puedeEditarTareaCrm(profile: Profile | null | undefined, assignedTo?: string | null) {
  if (!profile) return false
  if (profile.role === 'super_admin') return true
  if (profile.role === 'kam' && assignedTo && profile.id === assignedTo) return true
  return false
}

/** Permite reprogramación según el tipo de fila agenda. */
function puedeReprogramar(p: PendienteItem, profile: Profile | null | undefined): boolean {
  if (!profile || profile.role === 'reader') return false
  // Si llegamos aquí, el rol ya no es reader (TS lo infiere tras el guard anterior).
  if (p.fuente === 'followup' && p.followupReminderId) return true
  if (p.fuente === 'crm_task' && p.crmTaskId) return puedeEditarTareaCrm(profile, p.crmAssignedTo)
  if (p.fuente === 'quote_close' && p.quoteId) return puedeEditarCotizacion(profile, p.quoteKamId)
  return false
}

export interface AgendaMesDetalleRowProps {
  p: PendienteItem
  hoyStr: string
  profile: Profile | null | undefined
  canEdit: boolean
}

export default function AgendaMesDetalleRow({ p, hoyStr, profile, canEdit }: AgendaMesDetalleRowProps) {
  const qc = useQueryClient()
  const [expandido, setExpandido] = useState(false)
  const [fechaReprog, setFechaReprog] = useState(p.fecha.slice(0, 10))

  useEffect(() => {
    setFechaReprog(p.fecha.slice(0, 10))
  }, [p.fecha, p.key])

  const invalidarAgenda = () => {
    void qc.invalidateQueries({ queryKey: ['agenda-pendientes'] })
  }

  const vencido = bucketPendiente(p.fecha, hoyStr) === 'vencido'
  const followupAlta = p.fuente === 'followup' && p.followupImportance === 'alta'
  const mostrarReprogramar = canEdit && puedeReprogramar(p, profile)

  const metaPrincipal = `${FUENTE_LABEL[p.fuente]} · Fecha ${fechaMostrada(p)}${vencido ? ' · vencido' : ''}`

  const mutReminder = useMutation({
    mutationFn: () =>
      updateCommercialReminderDueDate(p.followupReminderId!, `${fechaReprog}T12:00:00.000Z`),
    onSuccess: invalidarAgenda,
  })

  const mutTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tasks')
        .update({ due_date: `${fechaReprog}T12:00:00.000Z` })
        .eq('id', p.crmTaskId!)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidarAgenda,
  })

  const mutQuoteClose = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('quotes').update({ expected_close: fechaReprog }).eq('id', p.quoteId!)
      if (error) throw new Error(error.message)
    },
    onSuccess: invalidarAgenda,
  })

  const mutPagarFactura = useMutation({
    mutationFn: () => markInvoiceAsPaid(p.invoiceId!),
    onSuccess: () => {
      invalidarAgenda()
      void qc.invalidateQueries({ queryKey: cfInvoicesQueryKey(p.companyId) })
    },
  })

  const mutEtapaCot = useMutation({
    mutationFn: async (stage: QuoteStage) => {
      const { data: antes, error: fe } = await supabase
        .from('quotes')
        .select('stage')
        .eq('id', p.quoteId!)
        .single()
      if (fe) throw new Error(fe.message)
      const prevStage = normalizeQuoteStage((antes?.stage as string | undefined) ?? 'borrador')

      const closed = ['aceptada', 'rechazada', 'facturada'].includes(stage)
      const { error } = await supabase
        .from('quotes')
        .update({
          stage,
          closed_at: closed ? new Date().toISOString() : null,
        })
        .eq('id', p.quoteId!)
      if (error) throw new Error(error.message)

      await syncQuoteFollowupRemindersForStage(p.quoteId!, prevStage, stage)
    },
    onSuccess: () => {
      invalidateQuoteFollowupAgendaQueries(qc)
      void qc.invalidateQueries({ queryKey: ['fabricacion-pendiente-cotizaciones'] })
    },
  })

  function guardarReprogramacion() {
    if (p.fuente === 'followup' && p.followupReminderId) mutReminder.mutate()
    else if (p.fuente === 'crm_task' && p.crmTaskId) mutTask.mutate()
    else if (p.fuente === 'quote_close' && p.quoteId) mutQuoteClose.mutate()
  }

  const guardandoReprog =
    mutReminder.isPending || mutTask.isPending || mutQuoteClose.isPending
  const errReprog =
    (mutReminder.error as Error | undefined)?.message ??
    (mutTask.error as Error | undefined)?.message ??
    (mutQuoteClose.error as Error | undefined)?.message

  const seguimientoFacturaAccion =
    canEdit &&
    p.fuente === 'followup' &&
    p.followupSubject === 'invoice' &&
    p.invoiceId

  const seguimientoCotAccion =
    canEdit &&
    p.fuente === 'followup' &&
    p.followupSubject === 'quote' &&
    p.quoteId &&
    puedeEditarCotizacion(profile, p.quoteKamId)

  const esperandoMutation = mutEtapaCot.isPending || mutPagarFactura.isPending
  const errAccion =
    (mutEtapaCot.error as Error | undefined)?.message ?? (mutPagarFactura.error as Error | undefined)?.message

  /** Evita borde hueco cuando el usuario no puede reprogramar ni tiene acciones de factura/cotización */
  const hayPieEditor =
    mostrarReprogramar || seguimientoFacturaAccion || seguimientoCotAccion

  const titleAttr = `${p.titulo} — ${metaPrincipal}`
  /** Texto que describe de qué trata el evento (prioriza cuerpo de seguimiento / descripción de tarea). */
  const textoDetalleEvento =
    (p.detalleEvento ?? '').trim() ||
    ((p.subtitulo ?? '').trim())

  return (
    <div className={cn(followupAlta && 'border-l-[3px] border-l-red-500 pl-3 -ml-0.5')}>
      {/* Una sola línea + ampliar (detalle sólo texto al expandir) */}
      <div className="flex items-center gap-2 px-3 py-2.5 min-w-0">
        <span className="shrink-0 text-gray-400 flex items-center justify-center w-5">
          {p.fuente === 'quote_close' && <FileText size={15} className="text-blue-500" />}
          {p.fuente === 'crm_task' && <ListTodo size={15} className="text-violet-600" />}
          {p.fuente === 'followup' && (
            <span
              className={cn('block w-2.5 h-2.5 rounded-full', followupDotClass(p.followupSubject))}
              title={
                p.followupSubject === 'company'
                  ? 'Llamados'
                  : p.followupSubject === 'quote'
                    ? 'Cotización'
                    : 'Factura'
              }
            />
          )}
        </span>
        <p className="text-xs text-gray-800 min-w-0 flex-1 truncate" title={titleAttr}>
          <Link
            to={linkFichaEmpresa(p)}
            className="font-medium text-blue-700 hover:text-blue-900 hover:underline shrink-0"
            onClick={e => e.stopPropagation()}
          >
            {p.companyName}
          </Link>
          <span className="text-gray-400"> · </span>
          {p.quoteId ? (
            <>
              {p.fuente === 'crm_task' && (
                <>
                  <span className="font-medium text-gray-900">{p.titulo}</span>
                  <span className="text-gray-400"> · </span>
                </>
              )}
              <Link
                to={linkCotizacion(p.quoteId)}
                className="font-medium text-violet-800 hover:text-violet-950 hover:underline shrink-0"
              >
                {etiquetaEnlaceCotizacion(p)}
              </Link>
              <span className="text-gray-400"> · </span>
              <span className="text-gray-700">{metaPrincipal}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-gray-900">{p.titulo}</span>
              <span className="text-gray-400"> · </span>
              <span className="text-gray-700">{metaPrincipal}</span>
            </>
          )}
          {p.fuente === 'crm_task' && p.crmTaskPriority === 'urgent' && (
            <span className="ml-1.5 text-[9px] font-semibold uppercase bg-red-100 text-red-800 px-1 py-px rounded">
              Urgente
            </span>
          )}
          {followupAlta && (
            <span className="ml-1.5 text-[9px] font-semibold uppercase bg-red-200 text-red-900 px-1 py-px rounded">
              Alta
            </span>
          )}
        </p>
        <button
          type="button"
          className="shrink-0 p-1 rounded-md text-violet-700 hover:bg-violet-50 border border-transparent hover:border-violet-200"
          aria-expanded={expandido}
          aria-label={expandido ? 'Contraer detalle' : 'Ampliar detalle'}
          onClick={() => setExpandido(v => !v)}
        >
          {expandido ? <Minus size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {expandido && (
        <div className="px-3 pb-2 pl-[2.85rem] border-t border-gray-50 bg-gray-50/40 pt-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Detalle del evento</p>
          <p className="mt-1.5 text-xs text-gray-800 whitespace-pre-wrap">
            {textoDetalleEvento || 'No hay texto registrado sobre de qué trata este pendiente.'}
          </p>
        </div>
      )}

      {canEdit && hayPieEditor && (
        <div className="border-t border-gray-100 px-3 py-2 bg-slate-50/80">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto py-0.5">
            {mostrarReprogramar && (
              <>
                <span className="text-[10px] font-medium text-gray-600 shrink-0">Reprogramar</span>
                <input
                  type="date"
                  className="shrink-0 border border-gray-200 rounded-lg px-2 py-1 text-[11px] h-7 bg-white w-[9.75rem]"
                  value={fechaReprog}
                  onChange={e => setFechaReprog(e.target.value)}
                  aria-label="Nueva fecha"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2 shrink-0"
                  disabled={guardandoReprog}
                  onClick={guardarReprogramacion}
                >
                  {guardandoReprog ? '…' : 'Guardar fecha'}
                </Button>
              </>
            )}
            {seguimientoFacturaAccion && (
              <>
                {mostrarReprogramar ? <span className="inline-block w-px h-5 bg-gray-200 shrink-0 mx-1" aria-hidden /> : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] px-2 shrink-0 border-emerald-200 text-emerald-900 bg-emerald-50/80 hover:bg-emerald-50"
                  disabled={mutPagarFactura.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        '¿Marcar la factura como pagada? Se cerrará el pendiente del seguimiento en la agenda.',
                      )
                    )
                      return
                    mutPagarFactura.mutate()
                  }}
                >
                  {mutPagarFactura.isPending ? '…' : 'Marcar pagada'}
                </Button>
              </>
            )}
            {seguimientoCotAccion && (
              <>
                {mostrarReprogramar || seguimientoFacturaAccion ? (
                  <span className="inline-block w-px h-5 bg-gray-200 shrink-0 mx-1" aria-hidden />
                ) : null}
                <span className="text-[10px] text-gray-500 shrink-0">Cerrar:</span>
                {(['aceptada', 'facturada', 'rechazada'] as const).map(st => (
                  <Button
                    key={st}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-1.5 shrink-0"
                    disabled={mutEtapaCot.isPending}
                    onClick={() => {
                      const label =
                        st === 'facturada'
                          ? 'orden de venta'
                          : st === 'aceptada'
                            ? 'aceptada'
                            : 'rechazada'
                      if (
                        !window.confirm(
                          `¿Marcar la cotización como ${label}? Se actualizará el estado y puede cerrarse el seguimiento en agenda.`,
                        )
                      )
                        return
                      mutEtapaCot.mutate(st)
                    }}
                  >
                    {st === 'facturada'
                      ? 'Facturada'
                      : st === 'aceptada'
                        ? 'Aceptada'
                        : 'Rechazada'}
                  </Button>
                ))}
              </>
            )}
            {esperandoMutation && !errAccion ? (
              <span className="text-[10px] text-gray-400 shrink-0 ml-1">Actualizando…</span>
            ) : null}
          </div>
          {(errReprog || errAccion) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-red-600">
              {errReprog ? <span>{errReprog}</span> : null}
              {errAccion ? <span>{errAccion}</span> : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
