// src/pages/dashboard/DashboardPage.tsx
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/types'
import { cn } from '@/lib/utils'
import {
  FileText, Phone, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, Building2, ChevronRight, Calendar, AlertCircle,
  LayoutDashboard, MessageCircle, Mail, Users, MapPin, CalendarDays,
  ListTodo,
} from 'lucide-react'
import { fetchPendientes, bucketPendiente, type PendienteItem } from '@/lib/agendaPendientes'

/* ─── tipos locales ─────────────────────────────────────────────── */
interface QuoteRow {
  id: string
  quote_number: string
  stage: string
  total: number
  currency: string
  probability: number
  expected_close: string | null
  closed_at: string | null
  updated_at: string
  kam_id: string
  company_id: string
  company: { id: string; name: string } | null
  kam:     { id: string; full_name: string } | null
}
interface CallRow {
  id: string
  called_at: string
  outcome: string
  type: string
  company_id: string
  quote_id: string | null
  company: { id: string; name: string } | null
  /** Presente cuando la interacción está ligada a una cotización */
  quote?: { id: string; quote_number: string } | null
}
interface KamProfile { id: string; full_name: string }

interface KamData {
  pipeline:          QuoteRow[]
  /** Misma fuente que /agenda (tareas CRM + cierres estimados) */
  pendientes:        PendienteItem[]
  upcomingCloses:    QuoteRow[]
  /** Registradas desde una cotización (seguimiento al negocio) */
  recentQuoteTouches: CallRow[]
}
interface AdminData {
  allQuotes:    QuoteRow[]
  allCompanies: { id: string; name: string; status: string }[]
  companyKams:  { company_id: string; kam_id: string }[]
  kams:         KamProfile[]
  pendientes:   PendienteItem[]
  recentQuoteTouches: CallRow[]
}

/* ─── constantes ────────────────────────────────────────────────── */
const ACTIVE_STAGES = ['borrador', 'en_negociacion', 'enviada']
const WON_STAGES    = ['aceptada', 'facturada']

const STAGE_LABEL: Record<string, string> = {
  borrador:       'Borrador',
  en_negociacion: 'En negociación',
  enviada:        'Enviada',
  aceptada:       'Aceptada',
  facturada: 'Facturada',
  rechazada:      'Rechazada',
}
const STAGE_CHIP: Record<string, string> = {
  borrador:       'bg-gray-100 text-gray-600',
  en_negociacion: 'bg-violet-100 text-violet-700',
  enviada:        'bg-blue-100 text-blue-700',
}
const OUTCOME_META: Record<string, { label: string; color: string }> = {
  sin_resultado:         { label: 'Sin resultado',         color: 'text-gray-400' },
  interesado:            { label: 'Interesado',            color: 'text-emerald-600' },
  no_interesado:         { label: 'No interesado',         color: 'text-red-500' },
  requiere_seguimiento:  { label: 'Requiere seguimiento',  color: 'text-amber-600' },
  cotizacion_solicitada: { label: 'Cotización solicitada', color: 'text-blue-600' },
  venta_cerrada:         { label: 'Venta cerrada',         color: 'text-purple-600' },
}

const CALL_TYPE_LABEL: Record<string, string> = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', email: 'Email', reunion: 'Reunión', visita: 'Visita',
}

/** Etiquetas cortas para ítems de la agenda unificada (panel KAM / admin) */
const AGENDA_FUENTE_LABEL: Record<PendienteItem['fuente'], string> = {
  quote_close: 'Cierre cotización',
  crm_task: 'Tarea CRM',
  followup: 'Seguimiento comercial',
}

function CallTypeGlyph({ type }: { type: string }) {
  const cls = 'text-gray-400 shrink-0 mt-0.5'
  switch (type) {
    case 'whatsapp': return <MessageCircle size={12} className={cls} />
    case 'email':    return <Mail size={12} className={cls} />
    case 'reunion':  return <Users size={12} className={cls} />
    case 'visita':   return <MapPin size={12} className={cls} />
    default:         return <Phone size={12} className={cls} />
  }
}

/* ─── helpers ────────────────────────────────────────────────────── */
const fmtCur = (amount: number, currency: string) => {
  if (currency === 'CLP')
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount)
  if (currency === 'USD')
    return `US$ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)}`
  return `UF ${new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
}
const fmtDate  = (d: string) => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
const daysAgo  = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)

/**
 * Seguimientos ligados a cotización: no usamos `.not('quote_id','is',null)` ni embed `quote:quotes`
 * en la misma query (a veces PostgREST/RLS devuelve cero filas). Tomamos llamadas recientes y
 * enriquecemos `quote_number` con una segunda consulta.
 */
async function enrichQuoteTouchesFromRecentCalls(
  recentAll: CallRow[],
  max: number,
): Promise<CallRow[]> {
  const withQuote = recentAll
    .filter(c => c.quote_id != null && String(c.quote_id).trim() !== '')
    .slice(0, max)
  const ids = [...new Set(withQuote.map(c => c.quote_id as string))]
  if (ids.length === 0) return []
  const { data: qrows } = await supabase.from('quotes').select('id, quote_number').in('id', ids)
  const meta: Record<string, { id: string; quote_number: string }> = {}
  for (const q of qrows ?? []) meta[q.id] = { id: q.id, quote_number: q.quote_number ?? '—' }
  return withQuote.map(c => ({
    ...c,
    quote: c.quote_id ? (meta[c.quote_id] ?? { id: c.quote_id, quote_number: '—' }) : null,
  }))
}

/** Respuesta del dashboard según rol (cacheable con TanStack Query). */
type DashboardPayload = { kind: 'kam'; data: KamData } | { kind: 'admin'; data: AdminData }

async function fetchDashboardPayload(profile: Profile): Promise<DashboardPayload> {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const plus30 = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)

  if (profile.role === 'kam') {
    const [quotesRes, recentCallsBatchRes, pendientes] = await Promise.all([
      supabase.from('quotes')
        .select('id, quote_number, stage, total, currency, probability, expected_close, closed_at, updated_at, kam_id, company_id, company:companies(id,name)')
        .eq('kam_id', profile.id)
        .in('stage', ACTIVE_STAGES)
        .order('updated_at', { ascending: false }),
      supabase.from('calls')
        .select('id, called_at, outcome, type, company_id, quote_id, company:companies(id,name)')
        .eq('kam_id', profile.id)
        .order('called_at', { ascending: false })
        .limit(500),
      fetchPendientes({ profile, companyId: undefined }),
    ])

    const pipeline = (quotesRes.data ?? []) as unknown as QuoteRow[]
    const recentQuoteTouches = await enrichQuoteTouchesFromRecentCalls(
      (recentCallsBatchRes.data ?? []) as unknown as CallRow[],
      8,
    )

    return {
      kind: 'kam',
      data: {
        pipeline,
        pendientes,
        upcomingCloses: pipeline
          .filter(q => q.expected_close && q.expected_close >= todayStr && q.expected_close <= plus30)
          .sort((a, b) => (a.expected_close ?? '').localeCompare(b.expected_close ?? '')),
        recentQuoteTouches,
      },
    }
  }

  const [quotesRes, companiesRes, companyKamsRes, kamsRes, recentCallsBatchRes, pendientes] =
    await Promise.all([
      supabase.from('quotes')
        .select('id, quote_number, stage, total, currency, probability, expected_close, closed_at, updated_at, kam_id, company_id, company:companies(id,name), kam:profiles(id,full_name)')
        .order('updated_at', { ascending: false }),
      supabase.from('companies').select('id, name, status'),
      supabase.from('company_kams').select('company_id, kam_id'),
      supabase.from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .in('role', ['kam', 'super_admin'])
        .order('full_name'),
      supabase.from('calls')
        .select('id, called_at, outcome, type, company_id, quote_id, company:companies(id,name)')
        .order('called_at', { ascending: false })
        .limit(600),
      fetchPendientes({ profile, companyId: undefined }),
    ])

  const recentQuoteTouches = await enrichQuoteTouchesFromRecentCalls(
    (recentCallsBatchRes.data ?? []) as unknown as CallRow[],
    8,
  )

  return {
    kind: 'admin',
    data: {
      allQuotes: (quotesRes.data ?? []) as unknown as QuoteRow[],
      allCompanies: companiesRes.data ?? [],
      companyKams: companyKamsRes.data ?? [],
      kams: kamsRes.data ?? [],
      pendientes,
      recentQuoteTouches,
    },
  }
}

/* ══════════════════════════════════════════════════════════════════
   VISTA KAM — resumen accionable (cada número enlaza a la lista filtrada)
══════════════════════════════════════════════════════════════════ */
function KamView({ data }: { data: KamData }) {
  const now      = new Date()
  const monthStr = now.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  const hoyStr   = now.toISOString().slice(0, 10)
  const enviadas = data.pipeline.filter(q => q.stage === 'enviada')
  const vencidosAgenda = data.pendientes.filter(p => bucketPendiente(p.fecha, hoyStr) === 'vencido').length
  const agendaPreview = [...data.pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 12)

  const byStage = ACTIVE_STAGES
    .map(s => ({ stage: s, quotes: data.pipeline.filter(q => q.stage === s) }))
    .filter(g => g.quotes.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Panel</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{monthStr}</p>
          <p className="text-xs text-gray-400 mt-2 max-w-xl">
            Los recuadros de arriba son enlaces: te llevan a Cotizaciones con el filtro ya aplicado.
            “En etapa Enviada” son negocios en estado Enviada (seguimiento al cliente), no un dato aparte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/agenda"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <CalendarDays size={14} className="text-gray-500" />
            Agenda
          </Link>
          <Link
            to="/quotes?pipeline=activas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <LayoutDashboard size={14} className="text-gray-500" />
            Cotizaciones
          </Link>
          <Link
            to="/companies"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Building2 size={14} className="text-gray-500" />
            Empresas
          </Link>
        </div>
      </div>

      {/* KPIs — todos clickeables salvo tareas (aún no hay módulo de tareas) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon={<FileText      size={18} className="text-blue-500"   />}
          label="Cotizaciones en pipeline"
          value={data.pipeline.length}
          sub="Borrador + negociación + enviada"
          bg="bg-blue-50"
          to="/quotes?pipeline=activas"
        />
        <StatCard
          icon={<Clock         size={18} className="text-amber-500"  />}
          label="En etapa Enviada"
          value={enviadas.length}
          sub="Abre la lista filtrada por ese estado"
          bg="bg-amber-50"
          to="/quotes?stage=enviada"
        />
        <StatCard
          icon={<AlertTriangle size={18} className="text-red-500"    />}
          label="Pendientes vencidos"
          value={vencidosAgenda}
          sub="Actividades, contactos y cierres atrasados"
          bg="bg-red-50"
          urgent={vencidosAgenda > 0}
          to="/agenda"
        />
        <StatCard
          icon={<Calendar      size={18} className="text-emerald-500"/>}
          label="Cierres próximos"
          value={data.upcomingCloses.length}
          sub="Cierre estimado en 30 días"
          bg="bg-emerald-50"
          to="/quotes?cierres=30"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card
            title="Tu pipeline"
            action={{ label: 'Abrir cotizaciones (pipeline)', to: '/quotes', search: '?pipeline=activas' }}
          >
            {data.pipeline.length === 0
              ? <Empty text="No tienes cotizaciones activas en pipeline." />
              : (
                <div className="space-y-5">
                  {byStage.map(({ stage, quotes }) => (
                    <div key={stage}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', STAGE_CHIP[stage])}>
                            {STAGE_LABEL[stage]}
                          </span>
                          <span className="text-xs text-gray-400">{quotes.length}</span>
                        </div>
                        <Link
                          to={`/quotes?stage=${stage}`}
                          className="text-[11px] text-blue-600 hover:text-blue-700 shrink-0"
                        >
                          Ver todas →
                        </Link>
                      </div>
                      <div className="space-y-0.5">
                        {quotes.slice(0, 6).map(q => <QuoteLine key={q.id} q={q} />)}
                      </div>
                      {quotes.length > 6 && (
                        <Link
                          to={`/quotes?stage=${stage}`}
                          className="mt-2 inline-block text-xs text-blue-600 hover:underline"
                        >
                          +{quotes.length - 6} más en {STAGE_LABEL[stage]}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </Card>

          {data.upcomingCloses.length > 0 && (
            <Card
              title="Próximos cierres estimados (30 días)"
              action={{ label: 'Ver en cotizaciones', to: '/quotes', search: '?cierres=30' }}
            >
              <div className="space-y-0.5">
                {data.upcomingCloses.slice(0, 8).map(q => <QuoteLine key={q.id} q={q} showDeadline />)}
              </div>
              {data.upcomingCloses.length > 8 && (
                <Link to="/quotes?cierres=30" className="mt-3 inline-block text-xs text-blue-600 hover:underline">
                  Ver los {data.upcomingCloses.length} en la tabla filtrada
                </Link>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card
            title={`Tu agenda${data.pendientes.length ? ` (${data.pendientes.length})` : ''}`}
            action={{ label: 'Ver agenda completa', to: '/agenda' }}
            titleCls={vencidosAgenda > 0 ? 'text-red-700' : undefined}
            headBg={vencidosAgenda > 0 ? 'bg-red-50/80' : 'bg-violet-50/60'}
          >
            {data.pendientes.length === 0
              ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 py-1">
                  <CheckCircle2 size={14} />
                  Sin pendientes en la ventana de la agenda
                </span>
              )
              : (
                <div className="space-y-2">
                  {agendaPreview.map(p => (
                    <div key={p.key} className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-400 shrink-0 mt-0.5">
                        {p.fuente === 'quote_close' && <FileText size={13} />}
                        {p.fuente === 'crm_task' && <ListTodo size={13} className="text-violet-600" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{p.titulo}</p>
                        <p className="text-[10px] text-gray-500 truncate">{p.subtitulo}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {AGENDA_FUENTE_LABEL[p.fuente]} · {fmtDate(p.fecha.length === 10 ? `${p.fecha}T12:00:00` : p.fecha)}
                          {bucketPendiente(p.fecha, hoyStr) === 'vencido' && (
                            <span className="text-red-500 font-medium"> · vencido</span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                          <Link to={`/companies/${p.companyId}/v2`} className="text-[10px] text-blue-600 hover:underline truncate max-w-[140px]">
                            {p.companyName}
                          </Link>
                          {p.quoteId && (
                            <Link to="/quotes" state={{ highlightId: p.quoteId }} className="text-[10px] text-blue-600 hover:underline">
                              Cotización
                            </Link>
                          )}
                          {p.crmTaskId && (
                            <Link
                              to={`/companies/${p.companyId}/v2#seccion-seguimientos`}
                              className="text-[10px] text-violet-700 hover:underline"
                            >
                              Tarea CRM
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {data.pendientes.length > agendaPreview.length && (
                    <Link to="/agenda" className="text-xs text-blue-600 hover:underline inline-block pt-1">
                      Ver los {data.pendientes.length - agendaPreview.length} restantes en la agenda
                    </Link>
                  )}
                </div>
              )}
          </Card>

          <Card
            title="Seguimiento en cotizaciones"
            action={{ label: 'Ver pipeline', to: '/quotes', search: '?pipeline=activas' }}
            headBg="bg-blue-50/60"
          >
            <p className="text-[11px] text-gray-500 mb-3">
              Contactos registrados <span className="font-medium text-gray-700">desde una cotización</span> (post-envío o seguimiento del negocio).
            </p>
            {data.recentQuoteTouches.length === 0
              ? <Empty text="Sin seguimientos recientes ligados a cotizaciones." />
              : (
                <div className="space-y-2">
                  {data.recentQuoteTouches.map(c => {
                    const meta = OUTCOME_META[c.outcome]
                    const tipo = CALL_TYPE_LABEL[c.type] ?? c.type
                    const qid = c.quote?.id ?? c.quote_id
                    return (
                      <Link
                        key={c.id}
                        to="/quotes"
                        state={qid ? { highlightId: qid } : undefined}
                        className="flex items-start gap-2 py-1.5 border-b border-gray-50 last:border-0 rounded hover:bg-gray-50 transition-colors group"
                      >
                        <FileText size={12} className="text-blue-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">
                            {c.quote?.quote_number ? (
                              <span className="font-mono text-[11px] text-gray-500 mr-1">{c.quote.quote_number}</span>
                            ) : null}
                            {c.company?.name ?? '—'}
                          </p>
                          <p className="text-[10px] text-gray-400">{tipo}</p>
                          <p className={cn('text-[11px]', meta?.color ?? 'text-gray-400')}>{meta?.label ?? c.outcome}</p>
                        </div>
                        <span className="text-[10px] text-gray-300 shrink-0">{fmtDate(c.called_at)}</span>
                        <ChevronRight size={12} className="text-gray-200 group-hover:text-gray-400 shrink-0 mt-0.5" />
                      </Link>
                    )
                  })}
                </div>
              )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   VISTA SUPER ADMIN / READER
══════════════════════════════════════════════════════════════════ */
function AdminView({ data }: { data: AdminData }) {
  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthStr   = now.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  const staleDate  = new Date(now.getTime() - 14 * 86_400_000).toISOString()
  const hoyStr     = now.toISOString().slice(0, 10)
  const vencidosAgenda = data.pendientes.filter(p => bucketPendiente(p.fecha, hoyStr) === 'vencido').length
  const agendaPreview = [...data.pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 8)

  const active          = data.allQuotes.filter(q => ACTIVE_STAGES.includes(q.stage))
  const wonMonth        = data.allQuotes.filter(q => WON_STAGES.includes(q.stage) && q.closed_at && q.closed_at >= monthStart)
  const activeCompanies = data.allCompanies.filter(c => c.status === 'activo')
  const withKam         = new Set(data.companyKams.map(ck => ck.company_id))
  const noKam           = activeCompanies.filter(c => !withKam.has(c.id))
  const stagnant        = data.allQuotes.filter(q => q.stage === 'enviada' && q.updated_at < staleDate)

  const kamRows = data.kams
    .map(k => ({
      kam:  k,
      active: active.filter(q => q.kam_id === k.id),
      sent:   active.filter(q => q.kam_id === k.id && q.stage === 'enviada'),
      won:    wonMonth.filter(q => q.kam_id === k.id),
    }))
    .filter(r => r.active.length > 0 || r.won.length > 0)
    .sort((a, b) => b.active.length - a.active.length)

  const wonRanking = data.kams
    .map(k => ({ kam: k, won: wonMonth.filter(q => q.kam_id === k.id) }))
    .filter(r => r.won.length > 0)
    .sort((a, b) => b.won.length - a.won.length)

  const clpTotal   = active.filter(q => q.currency === 'CLP').reduce((s, q) => s + q.total, 0)
  const hasMixed   = active.some(q => q.currency !== 'CLP')
  const alertTotal = stagnant.length + noKam.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{monthStr}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard icon={<Building2     size={18} className="text-blue-500"   />} label="Empresas activas"     value={activeCompanies.length} bg="bg-blue-50" to="/companies" sub="Ir a empresas" />
        <StatCard icon={<FileText      size={18} className="text-violet-500" />} label="Cotizaciones en pipeline" value={active.length} sub="Borrador + negociación + enviada" bg="bg-violet-50" to="/quotes?pipeline=activas" />
        <StatCard icon={<TrendingUp    size={18} className="text-emerald-500"/>} label="Ganadas este mes"     value={wonMonth.length}        sub="Aceptadas y OV" bg="bg-emerald-50" to="/quotes?ganadas=mes" />
        <StatCard icon={<AlertTriangle size={18} className="text-red-500"    />} label="Alertas"              value={alertTotal}             sub="Enviadas +14 días sin movimiento · empresas activas sin KAM" bg="bg-red-50" urgent={alertTotal > 0} />
      </div>

      {/* Banner pipeline */}
      {clpTotal > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-gray-900 to-gray-700 px-6 py-5 text-white flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Pipeline activo · CLP</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">
              {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(clpTotal)}
            </p>
            {hasMixed && <p className="text-xs text-gray-500 mt-0.5">No incluye montos en USD / UF</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide">En etapa Enviada</p>
            <Link to="/quotes?stage=enviada" className="block group">
              <p className="text-3xl font-bold mt-1 tabular-nums group-hover:text-blue-200 transition-colors">
                {active.filter(q => q.stage === 'enviada').length}
              </p>
              <p className="text-xs text-gray-500 group-hover:text-gray-300">Clic para ver en cotizaciones</p>
            </Link>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-5">

        {/* Izquierda 2/3 */}
        <div className="col-span-2 space-y-5">

          <Card title="Pipeline por KAM" action={{ label: 'Abrir cotizaciones (pipeline)', to: '/quotes', search: '?pipeline=activas' }}>
            {kamRows.length === 0
              ? <Empty text="Sin datos de pipeline" />
              : <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {['KAM', 'Activas', 'Enviadas', 'Ganadas (mes)'].map(h => (
                        <th key={h} className={cn('pb-2.5 text-xs font-medium text-gray-400', h === 'KAM' ? 'text-left' : 'text-center')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {kamRows.map(({ kam, active: a, sent, won }) => (
                      <tr key={kam.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 text-sm font-medium text-gray-800">{kam.full_name}</td>
                        <td className="py-2.5 text-center">
                          <Pill value={a.length} cls="bg-violet-100 text-violet-700" />
                        </td>
                        <td className="py-2.5 text-center">
                          {sent.length > 0
                            ? <Pill value={sent.length} cls={sent.length > 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'} />
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="py-2.5 text-center">
                          {won.length > 0
                            ? <Pill value={won.length} cls="bg-emerald-100 text-emerald-700" />
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </Card>

          <Card title="Seguimiento en cotizaciones" action={{ label: 'Ver pipeline', to: '/quotes', search: '?pipeline=activas' }} headBg="bg-blue-50/60">
            <p className="text-[11px] text-gray-500 mb-3">Ligadas a una cotización.</p>
            {data.recentQuoteTouches.length === 0
              ? <Empty text="Sin registros recientes." />
              : (
                <div className="space-y-1.5">
                  {data.recentQuoteTouches.map(c => {
                    const meta = OUTCOME_META[c.outcome]
                    const tipo = CALL_TYPE_LABEL[c.type] ?? c.type
                    const qid = c.quote?.id ?? c.quote_id
                    return (
                      <Link
                        key={c.id}
                        to="/quotes"
                        state={qid ? { highlightId: qid } : undefined}
                        className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 rounded hover:bg-gray-50 group"
                      >
                        <FileText size={12} className="text-blue-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-800 flex-1 truncate">
                          {c.quote?.quote_number && <span className="font-mono text-xs text-gray-400 mr-1">{c.quote.quote_number}</span>}
                          {c.company?.name ?? '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0">{tipo}</span>
                        <span className={cn('text-xs shrink-0', meta?.color ?? 'text-gray-400')}>{meta?.label}</span>
                        <span className="text-[11px] text-gray-300 shrink-0">{fmtDate(c.called_at)}</span>
                        <ChevronRight size={11} className="text-gray-200 group-hover:text-gray-400 shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
          </Card>
        </div>

        {/* Derecha 1/3 */}
        <div className="space-y-5">

          <Card title="Ranking ganado (mes)" titleCls="text-emerald-700" headBg="bg-emerald-50">
            {wonRanking.length === 0
              ? <Empty text="Sin cierres este mes" />
              : <div className="space-y-2 py-1">
                  {wonRanking.map(({ kam, won }, i) => (
                    <div key={kam.id} className="flex items-center gap-2">
                      <span className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                        i === 1 ? 'bg-gray-100 text-gray-500'    :
                                  'bg-orange-50 text-orange-600'
                      )}>{i + 1}</span>
                      <span className="text-sm text-gray-800 flex-1 truncate">{kam.full_name}</span>
                      <span className="text-sm font-bold text-emerald-700">{won.length}</span>
                    </div>
                  ))}
                </div>
            }
          </Card>

          <Card
            title={`Agenda${data.pendientes.length ? ` (${data.pendientes.length})` : ''}`}
            action={{ label: 'Abrir agenda', to: '/agenda' }}
            titleCls={vencidosAgenda > 0 ? 'text-red-700' : undefined}
            headBg={vencidosAgenda > 0 ? 'bg-red-50/70' : 'bg-violet-50/50'}
          >
            {data.pendientes.length === 0
              ? <Empty text="Sin pendientes en la ventana de la agenda." />
              : (
                <div className="space-y-1.5">
                  {agendaPreview.map(p => (
                    <div key={p.key} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                      <span className="text-gray-400 shrink-0 mt-0.5">
                        {p.fuente === 'quote_close' && <FileText size={12} />}
                        {p.fuente === 'crm_task' && <ListTodo size={12} className="text-violet-600" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{p.titulo}</p>
                        <p className="text-[10px] text-gray-400">
                          {AGENDA_FUENTE_LABEL[p.fuente]} · {fmtDate(p.fecha.length === 10 ? `${p.fecha}T12:00:00` : p.fecha)}
                        </p>
                        <Link to={`/companies/${p.companyId}/v2`} className="text-[10px] text-blue-600 hover:underline truncate block max-w-full">
                          {p.companyName}
                        </Link>
                        {p.crmTaskId && (
                          <Link
                            to={`/companies/${p.companyId}/v2#seccion-seguimientos`}
                            className="text-[10px] text-violet-700 hover:underline"
                          >
                            Tarea CRM
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                  {data.pendientes.length > agendaPreview.length && (
                    <Link to="/agenda" className="text-xs text-blue-600 hover:underline">+{data.pendientes.length - agendaPreview.length} más</Link>
                  )}
                </div>
              )}
          </Card>

          <Card
            title={`Alertas${alertTotal > 0 ? ` (${alertTotal})` : ''}`}
            titleCls={alertTotal > 0 ? 'text-red-600' : undefined}
            headBg={alertTotal > 0 ? 'bg-red-50' : undefined}
          >
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
              Indicadores operativos: negocios en <span className="font-medium text-gray-700">Enviada</span> que no se
              actualizan hace más de 14 días, y empresas activas sin ningún KAM asignado en la tabla de relación.
            </p>
            {alertTotal === 0
              ? <span className="flex items-center gap-1.5 text-sm text-emerald-600 py-1"><CheckCircle2 size={14} />Todo en orden</span>
              : <div className="space-y-4">

                  {stagnant.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Enviadas estancadas +14 días ({stagnant.length})
                      </p>
                      <div className="space-y-1.5">
                        {stagnant.slice(0, 5).map(q => (
                          <Link
                            key={q.id}
                            to="/quotes"
                            state={{ highlightId: q.id }}
                            className="flex items-center gap-2 py-1 rounded hover:bg-gray-50 transition-colors group"
                          >
                            <AlertCircle size={12} className="text-amber-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-800 truncate">
                                {q.quote_number} · {q.company?.name}
                              </p>
                              <p className="text-[10px] text-amber-500">
                                {daysAgo(q.updated_at)}d sin cambios · {q.kam?.full_name?.split(' ')[0]}
                              </p>
                            </div>
                            <ChevronRight size={12} className="text-gray-200 group-hover:text-gray-400 shrink-0" />
                          </Link>
                        ))}
                        {stagnant.length > 5 && (
                          <Link to="/quotes" className="text-xs text-blue-500 pl-5 hover:underline">
                            +{stagnant.length - 5} más
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  {noKam.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Empresas sin KAM ({noKam.length})
                      </p>
                      <div className="space-y-1">
                        {noKam.slice(0, 5).map(c => (
                          <Link
                            key={c.id}
                            to="/companies"
                            className="flex items-center gap-2 py-0.5 hover:opacity-75 transition-opacity"
                          >
                            <Building2 size={12} className="text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-700 truncate flex-1">{c.name}</span>
                            <ChevronRight size={11} className="text-gray-200 shrink-0" />
                          </Link>
                        ))}
                        {noKam.length > 5 && (
                          <Link to="/companies" className="text-xs text-blue-500 pl-5 hover:underline">
                            +{noKam.length - 5} más
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </div>
            }
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ─── sub-componentes compartidos ───────────────────────────────── */

function StatCard({ icon, label, value, sub, bg, urgent, to }: {
  icon: React.ReactNode; label: string; value: number
  sub?: string; bg?: string; urgent?: boolean
  /** Si viene definido, toda la tarjeta es un enlace (p. ej. a Cotizaciones con filtros) */
  to?: string
}) {
  const inner = (
    <>
      <div className={cn('p-2 rounded-lg shrink-0', bg ?? 'bg-gray-50')}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
        <p className={cn('text-3xl font-bold mt-0.5 tabular-nums', urgent ? 'text-red-600' : 'text-gray-900')}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        {to && <p className="text-[10px] text-blue-600 mt-1 font-medium">Abrir →</p>}
      </div>
    </>
  )

  const shellCls = cn(
    'rounded-xl border p-4 flex items-start gap-3 transition-shadow',
    urgent ? 'border-red-200 bg-red-50' : cn('border-gray-200', bg ?? 'bg-white'),
    to && !urgent && 'hover:border-gray-300 hover:shadow-sm cursor-pointer',
    to && urgent && 'hover:shadow-sm cursor-pointer',
  )

  if (to) {
    return (
      <Link to={to} className={cn(shellCls, 'block no-underline text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2')}>
        {inner}
      </Link>
    )
  }

  return <div className={shellCls}>{inner}</div>
}

function Card({ title, children, action, titleCls, headBg }: {
  title: string; children: React.ReactNode
  action?: { label: string; to: string; search?: string }
  titleCls?: string; headBg?: string
}) {
  const actionTo = action
    ? `${action.to}${action.search ?? ''}`
    : ''
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className={cn('px-4 py-3 border-b flex items-center justify-between', headBg ?? 'bg-gray-50')}>
        <h2 className={cn('text-sm font-semibold text-gray-700', titleCls)}>{title}</h2>
        {action && (
          <Link to={actionTo} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 shrink-0">
            {action.label}<ChevronRight size={12} />
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function QuoteLine({ q, showStale, showDeadline }: {
  q: QuoteRow; showStale?: boolean; showDeadline?: boolean
}) {
  const days = showStale
    ? daysAgo(q.updated_at)
    : showDeadline && q.expected_close
    ? daysLeft(q.expected_close)
    : null

  return (
    <Link
      to="/quotes"
      state={{ highlightId: q.id }}
      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-800 truncate">{q.company?.name ?? '—'}</span>
          <span className="text-[10px] text-gray-400 font-mono shrink-0">{q.quote_number}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-medium text-gray-600">{fmtCur(q.total, q.currency)}</span>
          {showStale && days !== null && (
            <span className={cn('text-[10px]', days > 10 ? 'text-red-400' : 'text-amber-500')}>
              {days}d sin cambios
            </span>
          )}
          {showDeadline && days !== null && q.expected_close && (
            <span className={cn('text-[10px]', days <= 0 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-gray-400')}>
              {days <= 0 ? 'Vencido' : `${days}d`} · {fmtDate(q.expected_close)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={13} className="text-gray-200 group-hover:text-gray-400 shrink-0 transition-colors" />
    </Link>
  )
}

function Pill({ value, cls }: { value: number; cls: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center w-8 h-6 rounded-full text-xs font-semibold', cls)}>
      {value}
    </span>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 py-1">{text}</p>
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth()

  const q = useQuery({
    queryKey: ['dashboard', profile?.id, profile?.role],
    queryFn: () => fetchDashboardPayload(profile!),
    enabled: Boolean(!authLoading && profile),
    staleTime: 3 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
  })

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <p className="text-gray-400 text-sm">Cargando perfil…</p>
      </div>
    )
  }

  if (q.isPending) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <p className="text-gray-400 text-sm">Cargando dashboard…</p>
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        No se pudo cargar el panel. {q.error instanceof Error ? q.error.message : 'Error desconocido'}
      </div>
    )
  }

  const payload = q.data

  return (
    <div>
      {q.isFetching && !q.isPending && (
        <p className="text-right text-[11px] text-gray-400 mb-1" aria-live="polite">
          Actualizando datos…
        </p>
      )}
      {payload?.kind === 'kam' && <KamView data={payload.data} />}
      {payload?.kind === 'admin' && <AdminView data={payload.data} />}
    </div>
  )
}