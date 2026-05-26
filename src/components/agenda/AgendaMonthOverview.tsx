/**
 * Vista mensual compacta: por celda, día + cantidad de pendientes en una línea; cantidad en rojo si hay tarea urgente.
 */
import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PendienteItem } from '@/lib/agendaPendientes'

function localYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 42 celdas en grillas de 7 columnas (domingo a sábado). */
function calendarCells(monthAnchor: Date) {
  const year = monthAnchor.getFullYear()
  const monthIndex = monthAnchor.getMonth()
  const first = new Date(year, monthIndex, 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const todayStr = localYmd(new Date())
  const out: { dateStr: string; inMonth: boolean; isToday: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const dateStr = localYmd(d)
    out.push({
      dateStr,
      inMonth: d.getMonth() === monthIndex,
      isToday: dateStr === todayStr,
    })
  }
  return out
}

const WEEK = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

type DayAgg = {
  total: number
  hasUrgent: boolean
  /** Seguimiento comercial con importancia alta en recordatorio */
  hasHighFollowup: boolean
  followCompany: number
  followQuote: number
  followInvoice: number
  other: number
}

function dayStatsByDate(items: PendienteItem[]) {
  const m = new Map<string, DayAgg>()
  for (const p of items) {
    const d = p.fecha.slice(0, 10)
    const cur = m.get(d) ?? {
      total: 0,
      hasUrgent: false,
      hasHighFollowup: false,
      followCompany: 0,
      followQuote: 0,
      followInvoice: 0,
      other: 0,
    }
    cur.total += 1
    if (p.fuente === 'followup' && p.followupImportance === 'alta') cur.hasHighFollowup = true
    if (p.fuente === 'followup' && p.followupSubject) {
      if (p.followupSubject === 'company') cur.followCompany += 1
      else if (p.followupSubject === 'quote') cur.followQuote += 1
      else cur.followInvoice += 1
    } else {
      cur.other += 1
      if (p.fuente === 'crm_task' && p.crmTaskPriority === 'urgent') cur.hasUrgent = true
    }
    m.set(d, cur)
  }
  return m
}

export interface AgendaMonthOverviewProps {
  monthAnchor: Date
  items: PendienteItem[]
  hoyStr: string
  selectedDayStr: string | null
  onSelectDay: (dateStr: string | null) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onGoToday: () => void
}

function Badge({ n, className }: { n: number; className: string }) {
  if (n <= 0) return null
  return <span className={cn('tabular-nums text-[9px] font-bold rounded px-1 py-px min-w-[1rem] text-center', className)}>{n}</span>
}

export default function AgendaMonthOverview({
  monthAnchor,
  items,
  hoyStr,
  selectedDayStr,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  onGoToday,
}: AgendaMonthOverviewProps) {
  const cells = useMemo(() => calendarCells(monthAnchor), [monthAnchor])
  const statsByDate = useMemo(() => dayStatsByDate(items), [items])

  const title = monthAnchor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <Button type="button" variant="outline" size="icon-sm" onClick={onPrevMonth} aria-label="Mes anterior">
          <ChevronLeft size={16} />
        </Button>
        <div className="text-center min-w-0 px-2">
          <p className="text-sm font-semibold text-gray-900 capitalize truncate">{title}</p>
          <Button type="button" variant="link" className="text-xs h-auto py-0 text-violet-700" onClick={onGoToday}>
            Ir a hoy
          </Button>
        </div>
        <Button type="button" variant="outline" size="icon-sm" onClick={onNextMonth} aria-label="Mes siguiente">
          <ChevronRight size={16} />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-200 p-px text-[10px]">
        {WEEK.map((d, i) => (
          <div
            key={d}
            className="bg-gray-50 py-1 text-center font-semibold text-gray-500"
            title={['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][i]}
          >
            {d}
          </div>
        ))}
        {cells.map(c => {
          const st = statsByDate.get(c.dateStr)
          const n = st?.total ?? 0
          const hasUrgent = st?.hasUrgent ?? false
          const hasHighFollowup = st?.hasHighFollowup ?? false
          const vencido = c.dateStr < hoyStr && n > 0
          const selected = selectedDayStr === c.dateStr
          const dayNum = Number.parseInt(c.dateStr.slice(8, 10), 10)

          const rowClass = cn(
            'w-full flex items-center justify-between gap-0.5 rounded-sm px-1 py-0.5 min-h-[1.65rem] text-left leading-none',
            'cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-0',
            !c.inMonth && 'opacity-55',
            c.isToday && !selected && 'bg-violet-50/80 ring-1 ring-inset ring-violet-300/70',
            selected && 'bg-violet-100 ring-2 ring-inset ring-violet-600',
            !selected && !c.isToday && c.inMonth && 'bg-white',
            !c.inMonth && 'bg-gray-50/90',
            vencido && n > 0 && !selected && 'ring-1 ring-amber-200/90',
          )

          return (
            <button
              key={c.dateStr}
              type="button"
              className={rowClass}
              aria-pressed={selected}
              aria-label={
                n === 0
                  ? `Día ${c.dateStr}, sin pendientes. Pulse para filtrar el listado.`
                  : hasHighFollowup
                    ? `${n} pendientes el ${c.dateStr}; incluye seguimiento de importancia alta.`
                    : hasUrgent
                      ? `${n} pendientes el ${c.dateStr}, puede incluir tarea urgente.`
                      : `${n} pendientes el ${c.dateStr}.`
              }
              onClick={() => onSelectDay(selected ? null : c.dateStr)}
            >
              <span
                className={cn(
                  'tabular-nums text-[11px] font-semibold shrink-0 w-4 text-center',
                  selected && 'text-violet-900',
                  !selected && c.inMonth && !hasHighFollowup && 'text-gray-800',
                  !selected && !c.inMonth && 'text-gray-500',
                  !selected && hasHighFollowup && c.inMonth && 'font-bold text-red-700',
                )}
              >
                {dayNum}
              </span>
              {n > 0 && st ? (
                <div
                  className={cn(
                    'flex flex-wrap justify-end gap-0.5 flex-1 min-w-0',
                    hasUrgent && 'ring-1 ring-red-300/80 rounded-sm px-0.5 py-px',
                    hasHighFollowup && !hasUrgent && 'ring-1 ring-red-400/90 rounded-sm px-0.5 py-px bg-red-50/40',
                  )}
                >
                  <Badge n={st.followCompany} className="bg-blue-100 text-blue-800" />
                  <Badge n={st.followQuote} className="bg-green-100 text-green-800" />
                  <Badge n={st.followInvoice} className="bg-red-100 text-red-900" />
                  <Badge
                    n={st.other}
                    className={hasUrgent ? 'bg-red-100 text-red-800' : 'bg-violet-100 text-violet-900'}
                  />
                </div>
              ) : (
                <span className="w-5 shrink-0" aria-hidden />
              )}
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-500 px-3 py-1.5 border-t bg-gray-50/60 leading-snug">
        Por día: número a la izquierda; a la derecha conteos{' '}
        <span className="text-blue-700 font-medium">azul</span> (llamados),{' '}
        <span className="text-green-700 font-medium">verde</span> (cotización),{' '}
        <span className="text-red-800 font-medium">rojo</span> (factura),{' '}
        <span className="text-violet-800 font-medium">violeta</span> (cierre estimado / tareas CRM).         Marco rojo: tarea CRM urgente o día con seguimiento de importancia alta. Pulse un día para filtrar el detalle abajo; pulse de nuevo para ver todos los pendientes.
      </p>
    </div>
  )
}
