import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Deal, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import DealDialog from './DealDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, TrendingUp, ChevronRight, DollarSign, Calendar, User } from 'lucide-react'
import { cn } from '@/lib/utils'

type Stage = Deal['stage']

const STAGES: { key: Stage; label: string; color: string; bg: string; dot: string; dropBg: string }[] = [
  { key: 'nuevo',             label: 'Nuevo',       color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200',        dot: 'bg-sky-400',     dropBg: 'bg-sky-100' },
  { key: 'en_negociacion',    label: 'Negociación', color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',  dot: 'bg-violet-400',  dropBg: 'bg-violet-100' },
  { key: 'propuesta_enviada', label: 'Propuesta',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-400',   dropBg: 'bg-amber-100' },
  { key: 'ganado',            label: 'Ganado',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',dot: 'bg-emerald-400', dropBg: 'bg-emerald-100' },
  { key: 'perdido',           label: 'Perdido',     color: 'text-red-600',     bg: 'bg-red-50 border-red-200',        dot: 'bg-red-400',     dropBg: 'bg-red-100' },
]

type DealRow = Deal & {
  company?: Pick<Company, 'id' | 'name'>
  contact?: Pick<Contact, 'id' | 'first_name' | 'last_name'>
  kam?: Pick<Profile, 'id' | 'full_name'>
}

const fmt = (v?: number, cur?: string) =>
  v == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur ?? 'CLP', maximumFractionDigits: 0 }).format(v)

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) : null

export default function DealsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [deals, setDeals]           = useState<DealRow[]>([])
  const [fetching, setFetching]     = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected]     = useState<DealRow | null>(null)
  const [dragOver, setDragOver]     = useState<Stage | null>(null)
  const draggingId = useRef<string | null>(null)

  // Permiso por registro
  const canEdit = (deal: DealRow) =>
    profile?.role === 'super_admin' ||
    (profile?.role === 'kam' && deal.kam_id === profile?.id)

  useEffect(() => {
    if (authLoading) return
    load()
  }, [authLoading]) // eslint-disable-line

  async function load() {
    setFetching(true)
    // KAMs ven todos los negocios (pueden leer los ajenos, solo editar los propios)
    const { data } = await supabase
      .from('deals')
      .select('*, company:companies(id,name), contact:contacts(id,first_name,last_name), kam:profiles(id,full_name)')
      .order('created_at', { ascending: false })
    setDeals((data as DealRow[]) ?? [])
    setFetching(false)
  }

  // ─── Drag handlers ──────────────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, deal: DealRow) {
    if (!canEdit(deal)) { e.preventDefault(); return }
    draggingId.current = deal.id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, stage: Stage) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stage)
  }

  function handleDragLeave() {
    setDragOver(null)
  }

  async function handleDrop(e: React.DragEvent, newStage: Stage) {
    e.preventDefault()
    setDragOver(null)
    const id = draggingId.current
    draggingId.current = null
    if (!id) return

    const deal = deals.find(d => d.id === id)
    if (!deal || deal.stage === newStage) return
    if (!canEdit(deal)) return   // RLS también lo bloquea en backend

    // Optimistic update
    setDeals(prev => prev.map(d =>
      d.id === id ? { ...d, stage: newStage } : d
    ))

    const extra: Partial<Deal> = {}
    if (['ganado', 'perdido'].includes(newStage) && !deal.closed_at)
      extra.closed_at = new Date().toISOString()
    if (!['ganado', 'perdido'].includes(newStage))
      extra.closed_at = undefined

    const { error } = await supabase
      .from('deals')
      .update({ stage: newStage, ...extra })
      .eq('id', id)

    if (error) {
      setDeals(prev => prev.map(d =>
        d.id === id ? { ...d, stage: deal.stage } : d
      ))
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const byStage = (s: Stage) => deals.filter(d => d.stage === s)
  const total   = (s: Stage) => byStage(s).reduce((n, d) => n + (d.expected_value ?? 0), 0)

  const canCreate = profile?.role !== 'reader'

  return (
    <>
      <div className="-m-8 flex flex-col" style={{ minHeight: '100vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-gray-500" />
            <h1 className="text-base font-semibold">Negocios</h1>
            <Badge variant="secondary" className="text-xs">{deals.length}</Badge>
          </div>
          {canCreate && (
            <Button size="sm" onClick={() => { setSelected(null); setDialogOpen(true) }} className="gap-1.5 h-8 text-xs">
              <Plus size={14} /> Nuevo negocio
            </Button>
          )}
        </div>

        {/* Board */}
        {fetching ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Cargando...
          </div>
        ) : (
          <div className="flex-1 bg-gray-100 flex gap-2 p-3 overflow-hidden">
            {STAGES.map(({ key, label, color, bg, dot, dropBg }) => {
              const cards  = byStage(key)
              const sum    = total(key)
              const isOver = dragOver === key

              return (
                <div
                  key={key}
                  className="flex flex-col rounded-lg border overflow-hidden flex-1 min-w-0"
                  onDragOver={e => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, key)}
                >
                  {/* Column header */}
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

                  {/* Cards */}
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
                        draggable={canEdit(d)}
                        onDragStart={e => handleDragStart(e, d)}
                        onClick={() => { setSelected(d); setDialogOpen(true) }}
                        editable={canEdit(d)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
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

function DealCard({
  deal, onClick, editable, draggable, onDragStart,
}: {
  deal: DealRow
  onClick: () => void
  editable: boolean
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white rounded border border-gray-200 p-2 shadow-sm select-none cursor-pointer',
        draggable && 'cursor-grab active:cursor-grabbing hover:border-gray-300 hover:shadow transition-shadow',
        !editable && 'opacity-90'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-medium text-gray-900 leading-tight line-clamp-2">{deal.title}</p>
        <ChevronRight size={12} className="text-gray-300 shrink-0 mt-0.5" />
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
            <Calendar size={9} />{fmtDate(deal.expected_close)}
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
