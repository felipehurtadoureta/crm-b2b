import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company, Contact, Profile, Product, Quote, QuoteStage } from '@/types'
import { normalizeQuoteStage } from '@/types'
import QuoteDialog from './QuoteDialog'
import QuoteInvoiceValidationDialog from '@/components/quotes/QuoteInvoiceValidationDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, LayoutGrid, List, DollarSign, Calendar, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  invalidateQuoteFollowupAgendaQueries,
  syncQuoteFollowupRemindersForStage,
} from '@/lib/commercialFollowupsQuery'

interface QuoteRow extends Quote {
  company?: { id: string; name: string }
  contact?: { id: string; first_name: string; last_name: string }
  kam?:     { id: string; full_name: string }
}

const STAGES: {
  key: QuoteStage; label: string; color: string; bg: string; dot: string; dropBg: string
}[] = [
  { key: 'borrador',       label: 'Borrador',       color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',       dot: 'bg-gray-400',    dropBg: 'bg-gray-100'    },
  { key: 'en_negociacion', label: 'En negociación', color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',   dot: 'bg-violet-400',  dropBg: 'bg-violet-100'  },
  { key: 'enviada',        label: 'Enviada',        color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-400',    dropBg: 'bg-blue-100'    },
  { key: 'aceptada',       label: 'Aceptada',       color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-400', dropBg: 'bg-emerald-100' },
  { key: 'facturada', label: 'Facturada', color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',       dot: 'bg-teal-500',    dropBg: 'bg-teal-100'    },
  { key: 'rechazada',      label: 'Rechazada',      color: 'text-red-600',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-400',     dropBg: 'bg-red-100'     },
]

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]))

/** Mismas etapas que el dashboard considera “pipeline activo” */
const PIPELINE_STAGES: QuoteStage[] = ['borrador', 'en_negociacion', 'enviada']
const WON_STAGES_FILTER: QuoteStage[] = ['aceptada', 'facturada']

const fmtCurrency = (amount: number, currency: string) => {
  if (currency === 'CLP') return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount)
  if (currency === 'USD') return `US$ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
  return `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount)}`
}

const fmtDate  = (d: string) => new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtShort = (d: string) => new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })

export default function QuotesPage({ initialStage }: { initialStage?: QuoteStage } = {}) {
  const { profile, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [quotes, setQuotes]           = useState<QuoteRow[]>([])
  const [companies, setCompanies]     = useState<Company[]>([])
  const [contacts, setContacts]       = useState<Contact[]>([])
  const [kams, setKams]               = useState<Profile[]>([])
  const [products, setProducts]       = useState<Product[]>([])
  const [ancillaryReady, setAncillaryReady] = useState(false)
  const [quotesReady, setQuotesReady] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState<'kanban' | 'table'>('kanban')
  const [dialogOpen, setDialogOpen]         = useState(false)
  const [selected, setSelected]             = useState<QuoteRow | null>(null)
  const [search, setSearch]                 = useState('')
  const [filterStage, setFilterStage]       = useState<string>(() => initialStage ?? '__all__')
  const [deleteId, setDeleteId]             = useState<string | null>(null)
  const [deleting, setDeleting]             = useState(false)
  const [dragOver, setDragOver]             = useState<QuoteStage | null>(null)
  const [highlightId, setHighlightId]       = useState<string | undefined>()
  const [invoiceKanban, setInvoiceKanban]   = useState<QuoteRow | null>(null)
  /** Filtros especiales activados desde URL (panel / enlaces) */
  const [cierres30Only, setCierres30Only]   = useState(false)
  const [ganadasMesOnly, setGanadasMesOnly] = useState(false)
  const prevQsRef = useRef<string | null>(null)
  const [initialCompanyId, setInitialCompanyId] = useState<string | undefined>()
  const [initialContactId, setInitialContactId] = useState<string | undefined>()
  const [initialCallId, setInitialCallId]   = useState<string | undefined>()
  const draggingId = useRef<string | null>(null)

  const urlQuoteId = searchParams.get('quoteId')

  // Guardar state en ref inmediatamente al montar, antes de que se borre
  const pendingState = useRef<{
    openNew?: boolean; highlightId?: string
    companyId?: string; contactId?: string; callId?: string
  } | null>(location.state as any ?? null)

  const canEdit = (kamId: string) =>
    profile?.role === 'super_admin' || (profile?.role === 'kam' && kamId === profile?.id)

  // Enlace profundo: una cotización en Kanban (p. ej. desde seguimiento comercial)
  useEffect(() => {
    if (searchParams.get('quoteId')) {
      setView('kanban')
      return
    }
    const v = searchParams.get('view')
    if (v === 'table') setView('table')
    if (v === 'kanban') setView('kanban')
  }, [searchParams])

  useEffect(() => {
    const qid = searchParams.get('quoteId')
    if (!qid || !quotesReady || loading || view !== 'kanban') return
    setHighlightId(qid)
    const t = window.setTimeout(() => {
      document.getElementById(`kanban-card-${qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
    return () => window.clearTimeout(t)
  }, [searchParams, quotesReady, loading, view])

  // Limpiar state de navegación conservando query (filtros del panel)
  useEffect(() => {
    if (pendingState.current)
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, []) // eslint-disable-line

  // Aplicar filtros desde URL (?pipeline=activas, ?stage=…, ?cierres=30, ?ganadas=mes)
  useEffect(() => {
    const qs = searchParams.toString()
    const pipeline = searchParams.get('pipeline')
    const stage = searchParams.get('stage')
    const cierres = searchParams.get('cierres')
    const ganadas = searchParams.get('ganadas')

    const fromPanel =
      pipeline === 'activas'
      || (stage != null && STAGES.some(s => s.key === stage))
      || cierres === '30'
      || ganadas === 'mes'

    if (fromPanel) {
      if (ganadas === 'mes') {
        setGanadasMesOnly(true)
        setCierres30Only(false)
        setFilterStage('__all__')
      } else if (cierres === '30') {
        setCierres30Only(true)
        setGanadasMesOnly(false)
        setFilterStage('__all__')
      } else if (pipeline === 'activas') {
        setFilterStage('__pipeline__')
        setCierres30Only(false)
        setGanadasMesOnly(false)
      } else if (stage && STAGES.some(s => s.key === stage)) {
        setFilterStage(stage)
        setCierres30Only(false)
        setGanadasMesOnly(false)
      }
    } else if (prevQsRef.current && prevQsRef.current.length > 0 && qs.length === 0) {
      setFilterStage('__all__')
      setCierres30Only(false)
      setGanadasMesOnly(false)
    }
    prevQsRef.current = qs
  }, [searchParams])

  // Ejecutar cuando los datos estén listos
  useEffect(() => {
    const s = pendingState.current
    if (!s) return
    if (s.openNew && ancillaryReady) {
      pendingState.current = null
      setInitialCompanyId(s.companyId)
      setInitialContactId(s.contactId)
      setInitialCallId(s.callId)
      setSelected(null)
      setDialogOpen(true)
    }
    if (s.highlightId && quotesReady && !searchParams.get('quoteId')) {
      pendingState.current = null
      setView('table')
      setHighlightId(s.highlightId)
      setTimeout(() => {
        document.getElementById(`quote-row-${s.highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => setHighlightId(undefined), 3000)
      }, 100)
    }
  }, [ancillaryReady, quotesReady]) // eslint-disable-line

  // ancillary
  useEffect(() => {
    Promise.all([
      supabase.from('companies').select('*').eq('status', 'activo').order('name'),
      supabase.from('contacts').select('*').eq('is_active', true).order('first_name'),
      supabase.from('profiles').select('*').eq('is_active', true).in('role', ['kam', 'super_admin']).order('full_name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]).then(([c, co, k, p]) => {
      setCompanies(c.data ?? []); setContacts(co.data ?? [])
      setKams(k.data ?? []); setProducts(p.data ?? [])
      setAncillaryReady(true)
    })
  }, [])

  const loadQuotes = useCallback(async () => {
    setLoading(true); setQuotesReady(false)
    const { data } = await supabase
      .from('quotes')
      .select('*, company:companies(id,name), contact:contacts(id,first_name,last_name), kam:profiles(id,full_name)')
      .order('created_at', { ascending: false })
    setQuotes((data ?? []).map(q => ({ ...q, stage: normalizeQuoteStage(q.stage) })))
    setLoading(false); setQuotesReady(true)
  }, [])

  useEffect(() => { if (!authLoading) loadQuotes() }, [authLoading, loadQuotes])

  // drag
  function handleDragStart(e: React.DragEvent, q: QuoteRow) {
    if (!canEdit(q.kam?.id ?? '')) { e.preventDefault(); return }
    draggingId.current = q.id
    e.dataTransfer.effectAllowed = 'move'
  }

  async function handleDrop(e: React.DragEvent, newStage: QuoteStage) {
    e.preventDefault(); setDragOver(null)
    const id = draggingId.current; draggingId.current = null
    if (!id) return
    const q = quotes.find(x => x.id === id)
    if (!q || q.stage === newStage) return
    if (newStage === 'facturada') {
      setInvoiceKanban(q)
      return
    }
    setQuotes(prev => prev.map(x => x.id === id ? { ...x, stage: newStage } : x))
    const closed = ['aceptada', 'rechazada', 'facturada'].includes(newStage)
    const prevStage = q.stage
    const { error } = await supabase.from('quotes').update({
      stage: newStage,
      closed_at: closed && !q.closed_at ? new Date().toISOString() : (!closed ? null : q.closed_at),
    }).eq('id', id)
    if (error) {
      setQuotes(prev => prev.map(x => x.id === id ? { ...x, stage: q.stage } : x))
    } else {
      try {
        await syncQuoteFollowupRemindersForStage(id, prevStage, newStage)
      } catch (syncErr) {
        console.warn('[quotes] sync followup reminders', syncErr)
      }
      invalidateQuoteFollowupAgendaQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['fabricacion-pendiente-cotizaciones'] })
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('quote_items').delete().eq('quote_id', deleteId)
    await supabase.from('quotes').delete().eq('id', deleteId)
    setDeleteId(null); setDeleting(false)
    void queryClient.invalidateQueries({ queryKey: ['fabricacion-pendiente-cotizaciones'] })
    loadQuotes()
  }

  // Debe declararse antes del filtro (p. ej. ?cierres=30 usa `today`)
  const today = new Date().toISOString().slice(0, 10)
  const plus30Str = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const monthStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const filtered = quotes.filter(q => {
    const term = search.toLowerCase()
    const matchSearch = !search
      || (q.company?.name ?? '').toLowerCase().includes(term)
      || (q.quote_number ?? '').toLowerCase().includes(term)
      || (q.title ?? '').toLowerCase().includes(term)
      || (q.kam?.full_name ?? '').toLowerCase().includes(term)

    let matchFiltro = true
    if (ganadasMesOnly) {
      matchFiltro = WON_STAGES_FILTER.includes(q.stage)
        && !!(q.closed_at && q.closed_at >= monthStartIso)
    } else if (cierres30Only) {
      const ec = q.expected_close?.slice(0, 10)
      matchFiltro = !!ec && ec >= today && ec <= plus30Str && PIPELINE_STAGES.includes(q.stage)
    } else if (filterStage === '__pipeline__') {
      matchFiltro = PIPELINE_STAGES.includes(q.stage)
    } else {
      matchFiltro = filterStage === '__all__' || q.stage === filterStage
    }

    const matchUrlQuote = !urlQuoteId || q.id === urlQuoteId

    return matchSearch && matchFiltro && matchUrlQuote
  })

  const byStage = (s: QuoteStage) => filtered.filter(q => q.stage === s)
  const stageTotal = (s: QuoteStage) => byStage(s).reduce((n, q) => n + (q.total ?? 0), 0)

  return (
    <div className="-m-8 flex flex-col min-h-screen">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">Cotizaciones</h1>
          <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 font-medium tabular-nums">{quotes.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <button onClick={() => setView('kanban')}
              className={cn('px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors',
                view === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50')}>
              <LayoutGrid size={13} /> Kanban
            </button>
            <button onClick={() => setView('table')}
              className={cn('px-3 py-1.5 text-xs flex items-center gap-1.5 border-l transition-colors',
                view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50')}>
              <List size={13} /> Tabla
            </button>
          </div>
          {profile?.role !== 'reader' && (
            <Button size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => { setSelected(null); setDialogOpen(true) }}>
              <Plus size={14} /> Nueva cotización
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-50 border-b px-6 py-2 flex flex-wrap gap-3 items-center shrink-0">
        {(cierres30Only || ganadasMesOnly) && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-1 w-full sm:w-auto">
            {cierres30Only && 'Filtro del panel: cierre estimado en los próximos 30 días (pipeline activo).'}
            {ganadasMesOnly && 'Filtro del panel: aceptadas y órdenes de venta con cierre registrado este mes.'}
          </p>
        )}
        <Input placeholder="Buscar empresa, título, número, KAM..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm" />
        <Select
          value={filterStage}
          onValueChange={v => {
            setFilterStage(v)
            setCierres30Only(false)
            setGanadasMesOnly(false)
            setSearchParams(prev => {
              const next = new URLSearchParams(prev)
              next.delete('pipeline')
              next.delete('stage')
              next.delete('cierres')
              next.delete('ganadas')
              return next
            }, { replace: true })
          }}
        >
          <SelectTrigger className="w-[220px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los estados</SelectItem>
            <SelectItem value="__pipeline__">Solo pipeline (borrador + negociación + enviada)</SelectItem>
            {STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Cargando...</div>
      ) : view === 'kanban' ? (

        /* KANBAN */
        <div className="flex-1 bg-gray-100 flex gap-2 p-3 overflow-x-auto overflow-y-hidden">
          {STAGES.map(({ key, label, color, bg, dot, dropBg }) => {
            const cards  = byStage(key)
            const sum    = stageTotal(key)
            const isOver = dragOver === key
            return (
              <div key={key}
                className="flex flex-col rounded-lg border overflow-hidden flex-1 min-w-[190px] max-w-[260px]"
                onDragOver={e => { e.preventDefault(); setDragOver(key) }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => handleDrop(e, key)}
              >
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
                <div className={cn('flex flex-col gap-1.5 p-1.5 overflow-y-auto flex-1 transition-colors', isOver ? dropBg : 'bg-gray-50')}>
                  {cards.length === 0 && (
                    <div className={cn('flex-1 flex items-center justify-center text-[11px] rounded border-2 border-dashed min-h-16 transition-colors',
                      isOver ? 'border-gray-400 text-gray-400' : 'border-gray-200 text-gray-300')}>
                      {isOver ? 'Soltar aquí' : 'Sin cotizaciones'}
                    </div>
                  )}
                  {cards.map(q => (
                    <KanbanCard
                      key={q.id}
                      quote={q}
                      today={today}
                      highlighted={highlightId === q.id}
                      draggable={canEdit(q.kam?.id ?? '')}
                      onDragStart={e => handleDragStart(e, q)}
                      onClick={() => {
                        setSelected(q)
                        setDialogOpen(true)
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

      ) : (

        /* TABLA */
        <div className="px-6 py-4 overflow-auto flex-1">
          <div className="bg-white rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="text-xs font-semibold text-gray-700">N°</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700">Título / Negocio</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700">Empresa</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700">KAM</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700">Estado</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700 text-right">Total</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700">Cierre est.</TableHead>
                  <TableHead className="text-xs font-semibold text-gray-700">Creado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-12 text-center text-gray-400">No hay cotizaciones</TableCell></TableRow>
                ) : filtered.map(q => {
                  const st = STAGE_MAP[q.stage]
                  const userCanEdit = canEdit(q.kam?.id ?? '')
                  const expired = q.valid_until && q.valid_until < today && !['aceptada','facturada','rechazada'].includes(q.stage)
                  return (
                    <TableRow key={q.id} id={`quote-row-${q.id}`}
                      className={highlightId === q.id ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <TableCell className="font-mono text-xs text-gray-400">{q.quote_number}</TableCell>
                      <TableCell className="text-sm text-gray-800 max-w-[200px] truncate">
                        {q.title || '—'}
                        {expired && <span className="ml-2 text-[10px] text-red-400 font-normal">Vencida</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {q.company?.id ? (
                          <Link
                            to={`/companies/${q.company.id}/v2?cfTab=quotes`}
                            className="text-violet-700 hover:text-violet-900 hover:underline font-medium"
                            onClick={e => e.stopPropagation()}
                          >
                            {q.company.name}
                          </Link>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{q.kam?.full_name ?? '—'}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', st?.color, st?.bg.split(' ')[0])}>
                          {st?.label ?? q.stage}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm tabular-nums">
                        {q.total > 0 ? fmtCurrency(q.total, q.currency) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {q.expected_close ? fmtDate(q.expected_close) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-400">{fmtDate(q.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost"
                            onClick={() => { setSelected(q); setDialogOpen(true) }}
                            title={userCanEdit ? 'Editar' : 'Ver detalle'}>
                            <Pencil size={14} className={userCanEdit ? '' : 'text-gray-300'} />
                          </Button>
                          {userCanEdit && (
                            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600"
                              onClick={() => setDeleteId(q.id)}>
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="font-semibold text-gray-900 mb-1">¿Eliminar cotización?</h3>
            <p className="text-sm text-gray-500 mb-5">Se eliminará junto a todos sus ítems. No se puede deshacer.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <QuoteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        quote={selected}
        companies={companies}
        contacts={contacts}
        kams={kams}
        products={products}
        initialCompanyId={initialCompanyId}
        initialContactId={initialContactId}
        initialCallId={initialCallId}
        onSaved={() => {
          setDialogOpen(false)
          loadQuotes()
          invalidateQuoteFollowupAgendaQueries(queryClient)
        }}
      />

      {invoiceKanban && (
        <QuoteInvoiceValidationDialog
          open
          quoteId={invoiceKanban.id}
          companyId={invoiceKanban.company_id}
          quoteNumber={invoiceKanban.quote_number}
          quoteTotal={invoiceKanban.total}
          quoteCurrency={invoiceKanban.currency}
          onClose={() => setInvoiceKanban(null)}
          onCompleted={() => {
            setInvoiceKanban(null)
            void loadQuotes()
            invalidateQuoteFollowupAgendaQueries(queryClient)
          }}
        />
      )}
    </div>
  )
}

function KanbanCard({
  quote,
  onClick,
  draggable,
  onDragStart,
  today,
  highlighted,
}: {
  quote: QuoteRow
  onClick: () => void
  draggable: boolean
  onDragStart: (e: React.DragEvent) => void
  today: string
  highlighted?: boolean
}) {
  const expired = quote.valid_until && quote.valid_until < today
    && !['aceptada','facturada','rechazada'].includes(quote.stage)
  return (
    <div
      id={`kanban-card-${quote.id}`}
      draggable={draggable} onDragStart={onDragStart} onClick={onClick}
      className={cn(
        'bg-white rounded border border-gray-200 p-2 shadow-sm select-none cursor-pointer',
        'hover:border-gray-300 hover:shadow transition-shadow',
        draggable && 'cursor-grab active:cursor-grabbing',
        expired && 'border-l-2 border-l-red-400',
        highlighted && 'ring-2 ring-violet-500 ring-offset-1',
      )}
    >
      <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">{quote.title || quote.quote_number}</p>
      {quote.company?.name && quote.company?.id ? (
        <Link
          to={`/companies/${quote.company.id}/v2?cfTab=quotes`}
          className="text-xs text-violet-700 hover:underline mt-0.5 truncate block font-medium"
          onClick={e => e.stopPropagation()}
        >
          {quote.company.name}
        </Link>
      ) : quote.company?.name ? (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{quote.company.name}</p>
      ) : null}
      {(quote.total ?? 0) > 0 && (
        <div className="flex items-center gap-1 mt-1.5 text-[11px] text-gray-600">
          <DollarSign size={10} className="text-gray-400" />
          {fmtCurrency(quote.total, quote.currency)}
        </div>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        {quote.expected_close && (
          <span className={cn('flex items-center gap-0.5 text-[10px]',
            quote.expected_close < today ? 'text-red-400' : 'text-gray-400')}>
            <Calendar size={9} />{fmtShort(quote.expected_close)}
          </span>
        )}
        {quote.kam?.full_name && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
            <User size={9} />{quote.kam.full_name.split(' ')[0]}
          </span>
        )}
      </div>
      {(quote.probability ?? 0) > 0 && (
        <div className="mt-1.5">
          <div className="flex justify-between mb-0.5">
            <span className="text-[9px] text-gray-300">Prob.</span>
            <span className="text-[9px] font-medium text-gray-400">{quote.probability}%</span>
          </div>
          <div className="h-0.5 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-blue-400" style={{ width: `${quote.probability}%` }} />
          </div>
        </div>
      )}
      {expired && <p className="text-[9px] text-red-400 mt-1 font-medium">Vencida</p>}
    </div>
  )
}