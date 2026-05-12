import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company, Contact, Profile, Product, Quote } from '@/types'
import QuoteDialog from './QuoteDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, ShoppingBag, LayoutList, Columns } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuoteRow extends Quote {
  company?: { id: string; name: string }
  contact?: { id: string; first_name: string; last_name: string }
  kam?:     { id: string; full_name: string }
}

interface Props {
  defaultStatus?: string
}

type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'orden_de_venta'

const STAGES: {
  key: QuoteStatus; label: string
  color: string; bg: string; dot: string; dropBg: string
}[] = [
  { key: 'borrador',       label: 'Borrador',        color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',       dot: 'bg-gray-400',    dropBg: 'bg-gray-100'   },
  { key: 'enviada',        label: 'Enviada',          color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-400',    dropBg: 'bg-blue-100'   },
  { key: 'aceptada',       label: 'Aceptada',         color: 'text-green-700',   bg: 'bg-green-50 border-green-200',     dot: 'bg-green-400',   dropBg: 'bg-green-100'  },
  { key: 'rechazada',      label: 'Rechazada',        color: 'text-red-600',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-400',     dropBg: 'bg-red-100'    },
  { key: 'orden_de_venta', label: 'Orden de Venta',   color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   dot: 'bg-purple-400',  dropBg: 'bg-purple-100' },
]

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada', aceptada: 'Aceptada',
  rechazada: 'Rechazada', orden_de_venta: 'Orden de Venta',
}
const STATUS_COLORS: Record<string, string> = {
  borrador:       'bg-gray-100 text-gray-600',
  enviada:        'bg-blue-100 text-blue-700',
  aceptada:       'bg-green-100 text-green-700',
  rechazada:      'bg-red-100 text-red-600',
  orden_de_venta: 'bg-purple-100 text-purple-700',
}

const fmtCurrency = (amount: number, currency: string): string => {
  if (currency === 'CLP')
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount)
  if (currency === 'USD')
    return `US$ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
  return `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount)}`
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })

export default function QuotesPage({ defaultStatus }: Props) {
  const { profile, loading: authLoading } = useAuth()
  const location = useLocation()
  const navigate  = useNavigate()

  const isOVPage = defaultStatus === 'orden_de_venta'

  const [quotes, setQuotes]             = useState<QuoteRow[]>([])
  const [companies, setCompanies]       = useState<Company[]>([])
  const [contacts, setContacts]         = useState<Contact[]>([])
  const [kams, setKams]                 = useState<Profile[]>([])
  const [products, setProducts]         = useState<Product[]>([])
  const [ancillaryReady, setAncillaryReady] = useState(false)
  const [quotesReady, setQuotesReady]   = useState(false)
  const [loading, setLoading]           = useState(true)
  const [dialogOpen, setDialogOpen]     = useState(false)
  const [selected, setSelected]         = useState<QuoteRow | null>(null)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState(defaultStatus ?? '__all__')
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [toOvId, setToOvId]            = useState<string | null>(null)
  const [convertingOv, setConvertingOv] = useState(false)
  const [view, setView]                 = useState<'table' | 'kanban'>('table')
  const [dragOver, setDragOver]         = useState<QuoteStatus | null>(null)
  const draggingId = useRef<string | null>(null)

  const [initialDealId, setInitialDealId]       = useState<string | undefined>()
  const [initialCompanyId, setInitialCompanyId] = useState<string | undefined>()
  const [highlightId, setHighlightId]           = useState<string | undefined>()

  const pendingAction = useRef<{
    type: 'openNew', dealId?: string, companyId?: string
  } | { type: 'highlight', id: string } | null>(null)

  // Resetear al cambiar de página
  useEffect(() => {
    setFilterStatus(defaultStatus ?? '__all__')
    setSearch('')
  }, [defaultStatus])

  useEffect(() => {
    const state = location.state as {
      openNew?: boolean; dealId?: string; companyId?: string; highlightId?: string
    } | null
    if (!state) return
    if (state.openNew) {
      pendingAction.current = { type: 'openNew', dealId: state.dealId, companyId: state.companyId }
    } else if (state.highlightId) {
      pendingAction.current = { type: 'highlight', id: state.highlightId }
    }
    navigate(location.pathname, { replace: true, state: null })
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!pendingAction.current) return
    const action = pendingAction.current
    if (action.type === 'openNew' && ancillaryReady) {
      pendingAction.current = null
      setInitialDealId(action.dealId)
      setInitialCompanyId(action.companyId)
      setSelected(null)
      setDialogOpen(true)
    }
    if (action.type === 'highlight' && quotesReady) {
      pendingAction.current = null
      setHighlightId(action.id)
      setTimeout(() => {
        document.getElementById(`quote-row-${action.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => setHighlightId(undefined), 3000)
      }, 100)
    }
  }, [ancillaryReady, quotesReady])

  useEffect(() => {
    Promise.all([
      supabase.from('companies').select('*').eq('status', 'activo').order('name'),
      supabase.from('contacts').select('*').eq('is_active', true).order('first_name'),
      supabase.from('profiles').select('*').eq('is_active', true).in('role', ['kam', 'super_admin']).order('full_name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]).then(([c, co, k, p]) => {
      setCompanies(c.data ?? [])
      setContacts(co.data ?? [])
      setKams(k.data ?? [])
      setProducts(p.data ?? [])
      setAncillaryReady(true)
    })
  }, [])

  const loadQuotes = useCallback(async () => {
    setLoading(true)
    setQuotesReady(false)
    let query = supabase
      .from('quotes')
      .select(`*, company:companies(id,name), contact:contacts(id,first_name,last_name), kam:profiles(id,full_name)`)
      .order('created_at', { ascending: false })
    if (profile?.role === 'kam') query = query.eq('kam_id', profile.id)
    if (defaultStatus) query = query.eq('status', defaultStatus)
    const { data } = await query
    setQuotes(data ?? [])
    setLoading(false)
    setQuotesReady(true)
  }, [profile?.id, profile?.role, defaultStatus])

  useEffect(() => {
    if (authLoading) return
    loadQuotes()
  }, [authLoading, loadQuotes, defaultStatus])

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const canDrag = profile?.role !== 'reader'

  function handleDragStart(e: React.DragEvent, id: string) {
    draggingId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, stage: QuoteStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stage)
  }

  async function handleDrop(e: React.DragEvent, newStatus: QuoteStatus) {
    e.preventDefault()
    setDragOver(null)
    const id = draggingId.current
    draggingId.current = null
    if (!id) return

    const quote = quotes.find(q => q.id === id)
    if (!quote || quote.status === newStatus) return

    // Convertir a OV requiere confirmación
    if (newStatus === 'orden_de_venta') {
      setToOvId(id)
      return
    }

    // Optimistic update
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: newStatus } : q))

    const { error } = await supabase.from('quotes').update({ status: newStatus }).eq('id', id)
    if (error) {
      setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: quote.status } : q))
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('quote_items').delete().eq('quote_id', deleteId)
    await supabase.from('quotes').delete().eq('id', deleteId)
    setDeleteId(null)
    setDeleting(false)
    loadQuotes()
  }

  // ── Convertir a OV ───────────────────────────────────────────────────────
  const handleConvertToOV = async () => {
    if (!toOvId) return
    setConvertingOv(true)

    const { data: items } = await supabase
      .from('quote_items').select('product_id')
      .eq('quote_id', toOvId).not('product_id', 'is', null)

    if (items?.length) {
      const productIds = items.map((i: any) => i.product_id).filter(Boolean)
      if (productIds.length) {
        await supabase.from('inventory_items')
          .update({ status: 'vendido' })
          .in('product_id', productIds).eq('status', 'disponible')
      }
    }

    await supabase.from('quotes').update({ status: 'orden_de_venta' }).eq('id', toOvId)
    setToOvId(null)
    setConvertingOv(false)
    loadQuotes()
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setInitialDealId(undefined)
    setInitialCompanyId(undefined)
  }

  // ── Filtros tabla ────────────────────────────────────────────────────────
  const filtered = quotes.filter(q => {
    const term = search.toLowerCase()
    const matchSearch = !search
      || (q.company?.name ?? '').toLowerCase().includes(term)
      || (q.quote_number  ?? '').toLowerCase().includes(term)
    const matchStatus = filterStatus === '__all__' || q.status === filterStatus
    return matchSearch && matchStatus
  })

  const byStage = (s: QuoteStatus) => quotes.filter(q => q.status === s)
  const stageTotal = (s: QuoteStatus) => byStage(s).reduce((n, q) => n + (q.total ?? 0), 0)

  return (
    <div className="-m-8 flex flex-col min-h-screen">

      {/* Header */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">
            {isOVPage ? 'Órdenes de Venta' : 'Cotizaciones'}
          </h1>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {quotes.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vista — solo en cotizaciones, no en OV */}
          {!isOVPage && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setView('table')}
                className={cn('px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors',
                  view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                <LayoutList size={13} /> Lista
              </button>
              <button
                onClick={() => setView('kanban')}
                className={cn('px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors border-l',
                  view === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
                )}
              >
                <Columns size={13} /> Kanban
              </button>
            </div>
          )}
          {!isOVPage && profile?.role !== 'reader' && (
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => {
              setSelected(null); setInitialDealId(undefined); setInitialCompanyId(undefined); setDialogOpen(true)
            }}>
              <Plus size={14} /> Nueva cotización
            </Button>
          )}
        </div>
      </div>

      {/* ── VISTA TABLA ─────────────────────────────────────────────────── */}
      {(view === 'table' || isOVPage) && (
        <>
          {/* Filtros */}
          <div className="px-6 py-2.5 bg-gray-50 border-b flex gap-3 items-center shrink-0">
            <Input
              placeholder="Buscar por empresa o número..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs h-9"
            />
            {!isOVPage && (
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los estados</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                  <SelectItem value="aceptada">Aceptada</SelectItem>
                  <SelectItem value="rechazada">Rechazada</SelectItem>
                  <SelectItem value="orden_de_venta">Orden de Venta</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tabla */}
          <div className="px-6 py-5 overflow-auto">
            <div className="bg-white rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableHead className="font-semibold">N°</TableHead>
                    <TableHead className="font-semibold">Empresa</TableHead>
                    <TableHead className="font-semibold">Contacto</TableHead>
                    <TableHead className="font-semibold">KAM</TableHead>
                    <TableHead className="font-semibold">Estado</TableHead>
                    <TableHead className="font-semibold">Moneda</TableHead>
                    <TableHead className="font-semibold text-right">Total</TableHead>
                    <TableHead className="font-semibold">Válido hasta</TableHead>
                    <TableHead className="font-semibold">Creado</TableHead>
                    {profile?.role !== 'reader' && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-gray-400">Cargando...</TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-gray-400">
                        {isOVPage ? 'No hay órdenes de venta' : 'No hay cotizaciones'}
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(q => (
                    <TableRow
                      key={q.id}
                      id={`quote-row-${q.id}`}
                      className={highlightId === q.id ? 'bg-blue-50 transition-colors duration-1000' : 'hover:bg-gray-50'}
                    >
                      <TableCell className="font-mono text-sm font-medium text-gray-900">{q.quote_number}</TableCell>
                      <TableCell className="font-medium text-gray-900">{q.company?.name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {q.contact ? `${q.contact.first_name} ${q.contact.last_name}` : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{q.kam?.full_name ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[q.status]}`}>
                            {STATUS_LABELS[q.status]}
                          </span>
                          {(q as any).is_tax_exempt && (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600">Exento</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{q.currency}</TableCell>
                      <TableCell className="text-right font-medium text-sm tabular-nums">
                        {fmtCurrency(q.total, q.currency)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {q.valid_until ? fmtDate(q.valid_until) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-400">{fmtDate(q.created_at)}</TableCell>
                      {profile?.role !== 'reader' && (
                        <TableCell>
                          <div className="flex gap-1 justify-end items-center">
                            {q.status === 'aceptada' && (
                              <Button size="sm" variant="ghost"
                                className="gap-1 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                onClick={() => setToOvId(q.id)} title="Convertir a Orden de Venta">
                                <ShoppingBag size={13} /> OV
                              </Button>
                            )}
                            <Button size="sm" variant="ghost"
                              onClick={() => { setSelected(q); setDialogOpen(true) }}>
                              <Pencil size={14} />
                            </Button>
                            {q.status !== 'orden_de_venta' && (
                              <Button size="sm" variant="ghost"
                                className="text-red-400 hover:text-red-600"
                                onClick={() => setDeleteId(q.id)}>
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* ── VISTA KANBAN ─────────────────────────────────────────────────── */}
      {view === 'kanban' && !isOVPage && (
        <div className="flex-1 bg-gray-100 flex gap-2 p-3 overflow-hidden">
          {STAGES.map(({ key, label, color, bg, dot, dropBg }) => {
            const cards  = byStage(key)
            const sum    = stageTotal(key)
            const isOver = dragOver === key

            return (
              <div
                key={key}
                className="flex flex-col rounded-lg border overflow-hidden flex-1 min-w-0"
                onDragOver={e => handleDragOver(e, key)}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, key)}
              >
                {/* Columna header */}
                <div className={cn('px-2 py-2 border-b shrink-0 transition-colors', isOver ? dropBg : bg)}>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
                    <span className={cn('text-xs font-semibold flex-1 truncate', color)}>{label}</span>
                    <span className={cn('text-xs font-medium tabular-nums', color)}>{cards.length}</span>
                  </div>
                  {sum > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5 pl-3 truncate">
                      {fmtCurrency(sum, cards[0]?.currency ?? 'CLP')}
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
                      {isOver ? 'Soltar aquí' : 'Sin cotizaciones'}
                    </div>
                  )}
                  {cards.map(q => (
                    <QuoteCard
                      key={q.id}
                      quote={q}
                      draggable={canDrag}
                      onDragStart={e => handleDragStart(e, q.id)}
                      onClick={() => { setSelected(q); setDialogOpen(true) }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm delete */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900 mb-1">¿Eliminar cotización?</h3>
            <p className="text-sm text-gray-500 mb-5">Se eliminará la cotización y todos sus ítems. No se puede deshacer.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm OV */}
      {toOvId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900 mb-1">¿Convertir a Orden de Venta?</h3>
            <p className="text-sm text-gray-500 mb-5">
              La cotización pasará a estado <strong>Orden de Venta</strong> y no podrá eliminarse.
              Los ítems de inventario vinculados quedarán marcados como vendidos.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setToOvId(null)} disabled={convertingOv}>Cancelar</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" onClick={handleConvertToOV} disabled={convertingOv}>
                {convertingOv ? 'Convirtiendo...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <QuoteDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        quote={selected}
        companies={companies}
        contacts={contacts}
        kams={kams}
        products={products}
        initialDealId={initialDealId}
        initialCompanyId={initialCompanyId}
        onSaved={() => { handleCloseDialog(); loadQuotes() }}
      />
    </div>
  )
}

// ── Kanban Card ──────────────────────────────────────────────────────────────
function QuoteCard({
  quote, onClick, draggable, onDragStart,
}: {
  quote: QuoteRow
  onClick: () => void
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
      )}
    >
      <p className="text-xs font-mono text-gray-400 mb-0.5">{quote.quote_number}</p>
      <p className="text-xs font-medium text-gray-900 leading-tight truncate">{quote.company?.name ?? '—'}</p>
      {quote.contact && (
        <p className="text-[10px] text-gray-400 truncate mt-0.5">
          {quote.contact.first_name} {quote.contact.last_name}
        </p>
      )}
      <p className="text-[11px] font-semibold text-gray-700 mt-1 tabular-nums">
        {fmtCurrency(quote.total, quote.currency)}
      </p>
      <div className="flex items-center justify-between mt-1">
        {quote.valid_until ? (
          <span className="text-[10px] text-gray-400">Vence {fmtDateShort(quote.valid_until)}</span>
        ) : <span />}
        {quote.kam?.full_name && (
          <span className="text-[10px] text-gray-400 truncate ml-1">{quote.kam.full_name.split(' ')[0]}</span>
        )}
      </div>
      {(quote as any).is_tax_exempt && (
        <span className="mt-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600">Exento</span>
      )}
    </div>
  )
}