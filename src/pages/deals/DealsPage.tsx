import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Deal, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import DealDialog from './DealDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Plus, TrendingUp, ChevronRight, DollarSign, Calendar, User,
  LayoutGrid, List, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── tipos ─────────────────────────────────────────────────────── */
type Stage = Deal['stage']
type ViewMode = 'kanban' | 'table'

const STAGES: {
  key: Stage; label: string; color: string; bg: string
  dot: string; dropBg: string; badge: string
}[] = [
  { key: 'nuevo',             label: 'Nuevo',       color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200',         dot: 'bg-sky-400',     dropBg: 'bg-sky-100',     badge: 'bg-sky-100 text-sky-700' },
  { key: 'en_negociacion',    label: 'Negociación', color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',   dot: 'bg-violet-400',  dropBg: 'bg-violet-100',  badge: 'bg-violet-100 text-violet-700' },
  { key: 'propuesta_enviada', label: 'Propuesta',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-400',   dropBg: 'bg-amber-100',   badge: 'bg-amber-100 text-amber-700' },
  { key: 'ganado',            label: 'Ganado',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-400', dropBg: 'bg-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'perdido',           label: 'Perdido',     color: 'text-red-600',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-400',     dropBg: 'bg-red-100',     badge: 'bg-red-100 text-red-600' },
]

type DealRow = Deal & {
  company?: Pick<Company, 'id' | 'name'>
  contact?: Pick<Contact, 'id' | 'first_name' | 'last_name'>
  kam?:     Pick<Profile, 'id' | 'full_name'>
}

/* ─── helpers ────────────────────────────────────────────────────── */
const fmt = (v?: number, cur?: string) =>
  v == null ? '—' : new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: cur ?? 'CLP', maximumFractionDigits: 0,
  }).format(v)

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const stageOf = (key: Stage) => STAGES.find(s => s.key === key)

/* ─── componente ─────────────────────────────────────────────────── */
export default function DealsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [deals, setDeals]           = useState<DealRow[]>([])
  const [fetching, setFetching]     = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected]     = useState<DealRow | null>(null)
  const [dragOver, setDragOver]     = useState<Stage | null>(null)
  const [view, setView]             = useState<ViewMode>('kanban')

  // filtros tabla
  const [search, setSearch]             = useState('')
  const [filterStage, setFilterStage]   = useState('__all__')

  const draggingId = useRef<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    load()
  }, [authLoading]) // eslint-disable-line

  async function load() {
    setFetching(true)
    let q = supabase
      .from('deals')
      .select('*, company:companies(id,name), contact:contacts(id,first_name,last_name), kam:profiles(id,full_name)')
      .order('created_at', { ascending: false })
    if (profile?.role === 'kam') q = q.eq('kam_id', profile.id)
    const { data } = await q
    setDeals((data as DealRow[]) ?? [])
    setFetching(false)
  }

  /* ── drag ──────────────────────────────────────────────────────── */
  function handleDragStart(e: React.DragEvent, dealId: string) {
    draggingId.current = dealId
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleDragOver(e: React.DragEvent, stage: Stage) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stage)
  }
  function handleDragLeave() { setDragOver(null) }

  async function handleDrop(e: React.DragEvent, newStage: Stage) {
    e.preventDefault()
    setDragOver(null)
    const id = draggingId.current
    draggingId.current = null
    if (!id) return
    const deal = deals.find(d => d.id === id)
    if (!deal || deal.stage === newStage) return

    setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: newStage } : d))

    const extra: Partial<Deal> = {}
    if (['ganado', 'perdido'].includes(newStage) && !deal.closed_at)
      extra.closed_at = new Date().toISOString()
    if (!['ganado', 'perdido'].includes(newStage))
      extra.closed_at = undefined

    const { error } = await supabase.from('deals').update({ stage: newStage, ...extra }).eq('id', id)
    if (error) setDeals(prev => prev.map(d => d.id === id ? { ...d, stage: deal.stage } : d))
  }

  /* ── helpers locales ───────────────────────────────────────────── */
  const byStage  = (s: Stage) => deals.filter(d => d.stage === s)
  const totalVal = (s: Stage) => byStage(s).reduce((n, d) => n + (d.expected_value ?? 0), 0)
  const canEdit  = profile?.role !== 'reader'

  const openNew  = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (d: DealRow) => { setSelected(d); setDialogOpen(true) }

  // filtro tabla
  const filtered = deals.filter(d => {
    const term = search.toLowerCase()
    const matchSearch = !search
      || d.title.toLowerCase().includes(term)
      || (d.company?.name ?? '').toLowerCase().includes(term)
      || (d.kam?.full_name ?? '').toLowerCase().includes(term)
    const matchStage = filterStage === '__all__' || d.stage === filterStage
    return matchSearch && matchStage
  })

  /* ── render ────────────────────────────────────────────────────── */
  return (
    <>
      <div className="-m-8 flex flex-col min-h-screen">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-gray-500" />
            <h1 className="text-base font-semibold">Negocios</h1>
            <Badge variant="secondary" className="text-xs">{deals.length}</Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* toggle vista */}
            <div className="flex items-center rounded-md border bg-gray-50 p-0.5">
              <button
                onClick={() => setView('kanban')}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <LayoutGrid size={13} /> Kanban
              </button>
              <button
                onClick={() => setView('table')}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <List size={13} /> Tabla
              </button>
            </div>

            {canEdit && (
              <Button size="sm" onClick={openNew} className="gap-1.5 h-8 text-xs">
                <Plus size={14} /> Nuevo negocio
              </Button>
            )}
          </div>
        </div>

        {/* ── Contenido ──────────────────────────────────────────── */}
        {fetching ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Cargando...
          </div>
        ) : view === 'kanban' ? (
          <KanbanView
            deals={deals}
            dragOver={dragOver}
            canEdit={canEdit}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            byStage={byStage}
            totalVal={totalVal}
            onEdit={openEdit}
          />
        ) : (
          <TableView
            deals={filtered}
            search={search}
            filterStage={filterStage}
            canEdit={canEdit}
            onSearchChange={setSearch}
            onStageChange={setFilterStage}
            onEdit={openEdit}
          />
        )}
      </div>

      <DealDialog
        open={dialogOpen}
        deal={selected}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════
   KANBAN
══════════════════════════════════════════════════════════════════ */
function KanbanView({
  deals, dragOver, canEdit,
  onDragStart, onDragOver, onDragLeave, onDrop,
  byStage, totalVal, onEdit,
}: {
  deals: DealRow[]
  dragOver: Stage | null
  canEdit: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragOver: (e: React.DragEvent, s: Stage) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, s: Stage) => void
  byStage: (s: Stage) => DealRow[]
  totalVal: (s: Stage) => number
  onEdit: (d: DealRow) => void
}) {
  return (
    <div className="flex-1 bg-gray-100 flex gap-2 p-3 overflow-hidden">
      {STAGES.map(({ key, label, color, bg, dot, dropBg }) => {
        const cards  = byStage(key)
        const sum    = totalVal(key)
        const isOver = dragOver === key

        return (
          <div
            key={key}
            className="flex flex-col rounded-lg border overflow-hidden flex-1 min-w-0"
            onDragOver={e => onDragOver(e, key)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, key)}
          >
            <div className={cn('px-2 py-2 border-b shrink-0 transition-colors', isOver ? dropBg : bg)}>
              <div className="flex items-center gap-1.5">
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
                <span className={cn('text-xs font-semibold flex-1 truncate', color)}>{label}</span>
                <span className={cn('text-xs font-medium tabular-nums', color)}>{cards.length}</span>
              </div>
              {sum > 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5 pl-3 truncate">
                  {fmt(sum, cards[0]?.currency)}
                </p>
              )}
            </div>

            <div className={cn(
              'flex flex-col gap-1.5 p-1.5 overflow-y-auto flex-1 transition-colors',
              isOver ? dropBg : 'bg-gray-50'
            )}>
              {cards.length === 0 && (
                <div className={cn(
                  'flex-1 flex items-center justify-center text-[11px] text-gray-300 rounded border-2 border-dashed transition-colors min-h-16',
                  isOver ? 'border-gray-400 text-gray-400' : 'border-gray-200'
                )}>
                  {isOver ? 'Soltar aquí' : 'Sin negocios'}
                </div>
              )}
              {cards.map(d => (
                <DealCard
                  key={d.id}
                  deal={d}
                  draggable={canEdit}
                  onDragStart={e => onDragStart(e, d.id)}
                  onClick={() => onEdit(d)}
                  readonly={!canEdit}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TABLA
══════════════════════════════════════════════════════════════════ */
function TableView({
  deals, search, filterStage, canEdit,
  onSearchChange, onStageChange, onEdit,
}: {
  deals: DealRow[]
  search: string
  filterStage: string
  canEdit: boolean
  onSearchChange: (v: string) => void
  onStageChange: (v: string) => void
  onEdit: (d: DealRow) => void
}) {
  return (
    <div className="flex flex-col flex-1">
      {/* filtros */}
      <div className="px-6 py-3 bg-gray-50 border-b flex gap-3 items-center">
        <Input
          placeholder="Buscar por título, empresa o KAM..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="max-w-xs h-9"
        />
        <Select value={filterStage} onValueChange={onStageChange}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las etapas</SelectItem>
            {STAGES.map(s => (
              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* tabla */}
      <div className="px-6 py-4 flex-1 overflow-auto">
        <div className="bg-white rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="font-semibold">Título</TableHead>
                <TableHead className="font-semibold">Empresa</TableHead>
                <TableHead className="font-semibold">Contacto</TableHead>
                <TableHead className="font-semibold">KAM</TableHead>
                <TableHead className="font-semibold">Etapa</TableHead>
                <TableHead className="font-semibold text-right">Valor esperado</TableHead>
                <TableHead className="font-semibold text-center">Prob.</TableHead>
                <TableHead className="font-semibold">Cierre est.</TableHead>
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-gray-400">
                    No hay negocios
                  </TableCell>
                </TableRow>
              ) : deals.map(d => {
                const stage = stageOf(d.stage)
                return (
                  <TableRow
                    key={d.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onEdit(d)}
                  >
                    <TableCell className="font-medium text-gray-900 max-w-[200px] truncate">
                      {d.title}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {d.company?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {d.contact
                        ? `${d.contact.first_name} ${d.contact.last_name}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {d.kam?.full_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      {stage && (
                        <span className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                          stage.badge
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', stage.dot)} />
                          {stage.label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium text-gray-800">
                      {fmt(d.expected_value, d.currency)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-medium text-gray-700">{d.probability}%</span>
                        <div className="w-12 h-1 rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-blue-400"
                            style={{ width: `${d.probability}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {fmtDate(d.expected_close)}
                    </TableCell>
                    {canEdit && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => onEdit(d)}
                        >
                          <Pencil size={14} />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* resumen por etapa */}
        {deals.length > 0 && (
          <div className="mt-4 flex gap-3 flex-wrap">
            {STAGES.map(s => {
              const count = deals.filter(d => d.stage === s.key).length
              const val   = deals.filter(d => d.stage === s.key).reduce((n, d) => n + (d.expected_value ?? 0), 0)
              if (count === 0) return null
              return (
                <div key={s.key} className={cn('rounded-lg border px-4 py-2 text-sm', s.bg)}>
                  <span className={cn('font-semibold', s.color)}>{s.label}</span>
                  <span className="text-gray-500 ml-2">{count} deal{count > 1 ? 's' : ''}</span>
                  {val > 0 && (
                    <span className="text-gray-400 ml-2">· {fmt(val, 'CLP')}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   DEAL CARD (Kanban)
══════════════════════════════════════════════════════════════════ */
function DealCard({
  deal, onClick, readonly, draggable, onDragStart,
}: {
  deal: DealRow
  onClick: () => void
  readonly: boolean
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white rounded border border-gray-200 p-2 shadow-sm select-none',
        draggable && 'cursor-grab active:cursor-grabbing hover:border-gray-300 hover:shadow transition-shadow',
        readonly && 'cursor-default'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium text-gray-900 leading-tight line-clamp-2">{deal.title}</p>
        {!readonly && <ChevronRight size={12} className="text-gray-300 shrink-0 mt-0.5" />}
      </div>

      {deal.company?.name && (
        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{deal.company.name}</p>
      )}

      {deal.expected_value != null && (
        <span className="flex items-center gap-1 text-[11px] text-gray-600 mt-1">
          <DollarSign size={10} className="text-gray-400" />
          {fmt(deal.expected_value, deal.currency)}
        </span>
      )}

      <div className="flex gap-2 mt-0.5">
        {deal.expected_close && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
            <Calendar size={9} />
            {new Date(deal.expected_close).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
          </span>
        )}
        {deal.kam?.full_name && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
            <User size={9} />{deal.kam.full_name.split(' ')[0]}
          </span>
        )}
      </div>

      <div className="mt-1.5">
        <div className="flex justify-between mb-0.5">
          <span className="text-[9px] text-gray-300">Prob.</span>
          <span className="text-[9px] font-medium text-gray-400">{deal.probability}%</span>
        </div>
        <div className="h-0.5 rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-blue-400" style={{ width: `${deal.probability}%` }} />
        </div>
      </div>
    </div>
  )
}