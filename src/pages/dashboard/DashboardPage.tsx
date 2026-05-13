import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/types'
import { TrendingUp, FileText, AlertTriangle, Building2, Award, ChevronRight, Clock } from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────────
const todayStr    = () => new Date().toISOString().slice(0, 10)
const startOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString() }
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d: string) =>
  new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
const fmtTotal = (total: number, currency: string) => {
  if (currency === 'CLP') return fmtCLP(total)
  if (currency === 'USD') return `US$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `UF ${total.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

// Stages activos = en pipeline (no cerrados)
const ACTIVE_STAGES = ['borrador', 'en_negociacion', 'enviada']
const CLOSED_WON    = ['aceptada', 'orden_de_venta']
const CLOSED_LOST   = ['rechazada']

const STAGE_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_negociacion: 'En negociación', enviada: 'Enviada',
  aceptada: 'Aceptada', orden_de_venta: 'Orden de venta', rechazada: 'Rechazada',
}
const STAGE_BAR: Record<string, string> = {
  borrador: 'bg-gray-400', en_negociacion: 'bg-violet-400', enviada: 'bg-blue-400',
}

const TYPE_ICON: Record<string, string> = { llamada: '📞', whatsapp: '💬', email: '✉️', reunion: '👥', visita: '📍' }
const OUTCOME_LABEL: Record<string, string> = {
  sin_resultado: 'Sin resultado', interesado: 'Interesado', no_interesado: 'No interesado',
  requiere_seguimiento: 'Seguimiento', cotizacion_solicitada: 'Cotiz. solicitada', venta_cerrada: 'Venta cerrada',
}
const OUTCOME_COLOR: Record<string, string> = {
  sin_resultado: 'text-gray-400', interesado: 'text-green-600', no_interesado: 'text-red-500',
  requiere_seguimiento: 'text-yellow-600', cotizacion_solicitada: 'text-blue-600', venta_cerrada: 'text-purple-600',
}

function ok(r: PromiseSettledResult<any>): any[] {
  if (r.status === 'rejected') { console.warn('Dashboard query rejected:', r.reason); return [] }
  if (r.value?.error) { console.warn('Dashboard query error:', r.value.error); return [] }
  return r.value?.data ?? []
}

// ─── primitives ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'text-gray-500', alert = false, to }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color?: string; alert?: boolean; to?: string
}) {
  const isAlert = alert && typeof value === 'number' && value > 0
  const inner = (
    <div className={`bg-white rounded-xl border p-5 flex items-start gap-4 transition-colors
      ${isAlert ? 'border-red-200 bg-red-50' : ''}
      ${to ? 'hover:border-gray-300 hover:bg-gray-50 cursor-pointer' : ''}`}>
      <div className={`p-2.5 rounded-lg shrink-0 ${isAlert ? 'bg-red-100' : 'bg-gray-100'}`}>
        <Icon size={20} className={isAlert ? 'text-red-500' : color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className={`text-xl font-bold ${isAlert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

const SeeAll = ({ to }: { to: string }) => (
  <Link to={to} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
    Ver todos <ChevronRight size={12} />
  </Link>
)
const Empty = ({ msg = 'Sin datos' }: { msg?: string }) => <p className="px-5 py-5 text-sm text-gray-400">{msg}</p>

// ─── KAM Dashboard ────────────────────────────────────────────────────────────
function KamDashboard({ profile }: { profile: Profile }) {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line

  async function load() {
    setLoading(true); setLoadError(false)
    try {
      const t    = todayStr()
      const som  = startOfMonth()
      const in30 = inDays(30)
      const id   = profile.id

      const results = await Promise.allSettled([
        // Pipeline activo (no cerradas)
        supabase.from('quotes').select('id, stage, total, currency, title, company:companies(name)')
          .eq('kam_id', id).in('stage', ACTIVE_STAGES),
        // Ganado este mes
        supabase.from('quotes').select('id, total')
          .eq('kam_id', id).in('stage', CLOSED_WON).gte('closed_at', som),
        // Tareas vencidas
        supabase.from('activities').select('id, title, due_date, type, company:companies(name)')
          .eq('kam_id', id).in('status', ['pendiente', 'en_progreso'])
          .lt('due_date', t).order('due_date', { ascending: true }).limit(8),
        // Tareas próximas
        supabase.from('activities').select('id, title, due_date, type')
          .eq('kam_id', id).in('status', ['pendiente', 'en_progreso'])
          .gte('due_date', t).lte('due_date', in30).order('due_date', { ascending: true }).limit(6),
        // Cotizaciones enviadas sin respuesta
        supabase.from('quotes').select('id, quote_number, title, total, currency, valid_until, company:companies(name)')
          .eq('kam_id', id).eq('stage', 'enviada').order('created_at', { ascending: false }),
        // Cierres próximos 30 días
        supabase.from('quotes').select('id, title, expected_close, total, currency, company:companies(name)')
          .eq('kam_id', id).in('stage', ACTIVE_STAGES)
          .not('expected_close', 'is', null)
          .gte('expected_close', t).lte('expected_close', in30)
          .order('expected_close', { ascending: true }).limit(5),
        // Últimas interacciones
        supabase.from('calls').select('id, called_at, type, outcome, company:companies(name), contact:contacts(first_name,last_name)')
          .eq('kam_id', id).order('called_at', { ascending: false }).limit(6),
        // Seguimientos vencidos
        supabase.from('calls').select('id, next_contact_date, company:companies(name)')
          .eq('kam_id', id).not('next_contact_date', 'is', null)
          .lt('next_contact_date', t).order('next_contact_date', { ascending: true }).limit(5),
      ])

      const [activeQuotes, wonQuotes, overdueActs, upcomingActs,
             sentQuotes, closingSoon, recentCalls, overdueFollowups] = results.map(ok)

      const byStage: Record<string, { count: number; value: number }> = {}
      for (const q of activeQuotes as any[]) {
        if (!byStage[q.stage]) byStage[q.stage] = { count: 0, value: 0 }
        byStage[q.stage].count++
        byStage[q.stage].value += q.total ?? 0
      }

      setData({
        totalPipeline: (activeQuotes as any[]).reduce((s, q) => s + (q.total ?? 0), 0),
        activeCount:   (activeQuotes as any[]).length,
        byStage,
        totalWon:      (wonQuotes as any[]).reduce((s, q) => s + (q.total ?? 0), 0),
        overdueActs, upcomingActs, sentQuotes, closingSoon, recentCalls, overdueFollowups,
      })
    } catch (e) { console.error(e); setLoadError(true) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="text-gray-400 text-sm py-16 text-center">Cargando dashboard...</div>
  if (loadError) return <div className="text-red-400 text-sm py-16 text-center">Error al cargar. Revisa la consola.</div>

  const { totalPipeline, activeCount, byStage, totalWon, overdueActs,
    upcomingActs, sentQuotes, closingSoon, recentCalls, overdueFollowups } = data

  const maxVal = Math.max(...ACTIVE_STAGES.map(s => byStage[s]?.value ?? 0), 1)
  const t = todayStr()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Hola, {profile.full_name.split(' ')[0]} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pipeline activo" value={fmtCLP(totalPipeline)} sub={`${activeCount} cotizaciones`} icon={TrendingUp} color="text-blue-500" to="/quotes" />
        <StatCard label="Ganado este mes" value={fmtCLP(totalWon)} icon={Award} color="text-emerald-500" to="/quotes" />
        <StatCard label="Tareas vencidas" value={(overdueActs as any[]).length} icon={AlertTriangle} alert />
        <StatCard label="Enviadas sin respuesta" value={(sentQuotes as any[]).length} icon={FileText} color="text-violet-500" to="/quotes" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Section title="Pipeline por etapa" action={<SeeAll to="/quotes" />}>
            <div className="p-5 space-y-3.5">
              {ACTIVE_STAGES.map(stage => {
                const s = byStage[stage] ?? { count: 0, value: 0 }
                return (
                  <Link key={stage} to="/quotes" className="block group">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-600 font-medium group-hover:text-blue-600 transition-colors">{STAGE_LABEL[stage]}</span>
                      <span className="text-gray-400">{s.count} · {fmtCLP(s.value)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${STAGE_BAR[stage]}`} style={{ width: `${(s.value / maxVal) * 100}%` }} />
                    </div>
                  </Link>
                )
              })}
              {activeCount === 0 && <Empty msg="Sin cotizaciones activas" />}
            </div>
          </Section>
        </div>

        <Section title={`Seguimientos vencidos (${(overdueFollowups as any[]).length})`}>
          {(overdueFollowups as any[]).length === 0
            ? <p className="px-5 py-5 text-sm text-gray-400">Todo al día ✓</p>
            : <ul className="divide-y">
                {(overdueFollowups as any[]).map((c: any) => (
                  <li key={c.id}>
                    <Link to="/calls" className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.company?.name}</p>
                      <p className="text-xs text-red-500 mt-0.5">Vencido el {fmtDate(c.next_contact_date)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
          }
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Section title="Cierres próximos — 30 días" action={<SeeAll to="/quotes" />}>
          {(closingSoon as any[]).length === 0 ? <Empty msg="Sin cierres próximos" /> : (
            <ul className="divide-y">
              {(closingSoon as any[]).map((q: any) => (
                <li key={q.id}>
                  <Link to="/quotes" state={{ highlightId: q.id }}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{q.title || q.id}</p>
                      <p className="text-xs text-gray-400">{q.company?.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {(q.total ?? 0) > 0 && <p className="text-sm font-semibold text-gray-800">{fmtTotal(q.total, q.currency)}</p>}
                      <p className="text-xs text-amber-600">{fmtDate(q.expected_close)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Tareas${(overdueActs as any[]).length > 0 ? ` · ${(overdueActs as any[]).length} vencidas` : ''}`}>
          {(overdueActs as any[]).length === 0 && (upcomingActs as any[]).length === 0
            ? <Empty msg="Sin tareas pendientes" />
            : <ul className="divide-y">
                {(overdueActs as any[]).map((a: any) => (
                  <li key={a.id} className="px-5 py-2.5 flex items-start gap-3">
                    <span className="text-[10px] bg-red-100 text-red-600 rounded px-1.5 py-0.5 shrink-0 font-medium mt-0.5">VENCIDA</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{a.title}</p>
                      {a.company?.name && <p className="text-[10px] text-gray-400">{a.company.name}</p>}
                    </div>
                    <p className="text-xs text-red-500 shrink-0">{fmtDate(a.due_date)}</p>
                  </li>
                ))}
                {(upcomingActs as any[]).map((a: any) => (
                  <li key={a.id} className="px-5 py-2.5 flex items-center gap-3">
                    <Clock size={12} className="text-gray-300 shrink-0" />
                    <p className="text-xs font-medium text-gray-900 flex-1 truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 shrink-0">{fmtDate(a.due_date)}</p>
                  </li>
                ))}
              </ul>
          }
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Section title="Últimas interacciones" action={<SeeAll to="/calls" />}>
          {(recentCalls as any[]).length === 0 ? <Empty msg="Sin interacciones recientes" /> : (
            <ul className="divide-y">
              {(recentCalls as any[]).map((c: any) => (
                <li key={c.id}>
                  <Link to="/calls" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <span className="text-base shrink-0">{TYPE_ICON[c.type] ?? '📞'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.company?.name}</p>
                      {c.contact && <p className="text-xs text-gray-400">{c.contact.first_name} {c.contact.last_name}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-medium ${OUTCOME_COLOR[c.outcome]}`}>{OUTCOME_LABEL[c.outcome]}</p>
                      <p className="text-xs text-gray-400">{fmtDate(c.called_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Enviadas sin respuesta" action={<SeeAll to="/quotes" />}>
          {(sentQuotes as any[]).length === 0 ? <Empty msg="Sin cotizaciones enviadas" /> : (
            <ul className="divide-y">
              {(sentQuotes as any[]).slice(0, 6).map((q: any) => (
                <li key={q.id}>
                  <Link to="/quotes" state={{ highlightId: q.id }}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-gray-400">{q.quote_number}</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{q.title || q.company?.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {(q.total ?? 0) > 0 && <p className="text-sm font-semibold text-gray-800">{fmtTotal(q.total, q.currency)}</p>}
                      {q.valid_until && (
                        <p className={`text-xs ${q.valid_until < t ? 'text-red-500' : 'text-gray-400'}`}>
                          {q.valid_until < t ? 'Vencida' : `Vence ${fmtDate(q.valid_until)}`}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ profile }: { profile: Profile }) {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line

  async function load() {
    setLoading(true); setLoadError(false)
    try {
      const t     = todayStr()
      const som   = startOfMonth()
      const ago30 = daysAgo(30)

      const results = await Promise.allSettled([
        supabase.from('companies').select('id, status'),
        supabase.from('quotes').select('id, stage, total, kam_id, kam:profiles(full_name)').in('stage', ACTIVE_STAGES),
        supabase.from('quotes').select('id, total, kam_id, kam:profiles(full_name)').in('stage', CLOSED_WON).gte('closed_at', som),
        supabase.from('quotes').select('id, stage'),
        supabase.from('company_kams').select('company_id'),
        // Cotizaciones estancadas +30 días sin actualizar
        supabase.from('quotes').select('id, title, stage, updated_at, company:companies(name), kam:profiles(full_name)')
          .in('stage', ACTIVE_STAGES).lt('updated_at', ago30)
          .order('updated_at', { ascending: true }).limit(6),
        supabase.from('calls').select('id, called_at, type, outcome, company:companies(name), kam:profiles(full_name)')
          .order('called_at', { ascending: false }).limit(8),
        // Cotizaciones enviadas con valid_until vencido
        supabase.from('quotes').select('id, quote_number, title, valid_until, total, currency, company:companies(name), kam:profiles(full_name)')
          .eq('stage', 'enviada').not('valid_until', 'is', null)
          .lt('valid_until', t).order('valid_until', { ascending: true }).limit(6),
      ])

      const [companies, activeQuotes, wonQuotes, allQuotes, companyKams,
             staleQuotes, recentCalls, expiredQuotes] = results.map(ok)

      const kamCompIds      = new Set((companyKams as any[]).map(r => r.company_id))
      const activeCompanies = (companies as any[]).filter(c => c.status === 'activo')

      const pipelineByKam: Record<string, { name: string; value: number; count: number }> = {}
      for (const q of activeQuotes as any[]) {
        const key = q.kam_id ?? '__none__'
        if (!pipelineByKam[key]) pipelineByKam[key] = { name: q.kam?.full_name ?? 'Sin KAM', value: 0, count: 0 }
        pipelineByKam[key].value += q.total ?? 0
        pipelineByKam[key].count++
      }
      const wonByKam: Record<string, { name: string; value: number; count: number }> = {}
      for (const q of wonQuotes as any[]) {
        const key = q.kam_id ?? '__none__'
        if (!wonByKam[key]) wonByKam[key] = { name: q.kam?.full_name ?? 'Sin KAM', value: 0, count: 0 }
        wonByKam[key].value += q.total ?? 0
        wonByKam[key].count++
      }

      setData({
        activeCount:     activeCompanies.length,
        withoutKamCount: activeCompanies.filter(c => !kamCompIds.has((c as any).id)).length,
        totalPipeline:   (activeQuotes as any[]).reduce((s, q) => s + (q.total ?? 0), 0),
        openCount:       (activeQuotes as any[]).length,
        totalWon:        (wonQuotes as any[]).reduce((s, q) => s + (q.total ?? 0), 0),
        sentCount:       (allQuotes as any[]).filter(q => (q as any).stage === 'enviada').length,
        pipelineByKam:   Object.values(pipelineByKam).sort((a, b) => b.value - a.value),
        wonByKam:        Object.values(wonByKam).sort((a, b) => b.value - a.value),
        staleQuotes, recentCalls, expiredQuotes,
      })
    } catch (e) { console.error(e); setLoadError(true) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="text-gray-400 text-sm py-16 text-center">Cargando dashboard...</div>
  if (loadError) return <div className="text-red-400 text-sm py-16 text-center">Error al cargar. Revisa la consola.</div>

  const { activeCount, withoutKamCount, totalPipeline, openCount, totalWon,
    sentCount, pipelineByKam, wonByKam, staleQuotes, recentCalls, expiredQuotes } = data

  const maxPipeline = Math.max(...(pipelineByKam as any[]).map(k => k.value), 1)
  const maxWon      = Math.max(...(wonByKam as any[]).map(k => k.value), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Empresas activas"   value={activeCount}           icon={Building2}     color="text-blue-500"   to="/companies" />
        <StatCard label="Pipeline total"      value={fmtCLP(totalPipeline)} sub={`${openCount} cotizaciones`} icon={TrendingUp} color="text-violet-500" to="/quotes" />
        <StatCard label="Ganado este mes"     value={fmtCLP(totalWon)}      icon={Award}         color="text-emerald-500" to="/quotes" />
        <StatCard label="Cotiz. enviadas"     value={sentCount}             icon={FileText}      color="text-amber-500"  to="/quotes" />
        <StatCard label="Empresas sin KAM"    value={withoutKamCount}       icon={AlertTriangle} alert />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Section title="Pipeline activo por KAM" action={<SeeAll to="/quotes" />}>
          <div className="p-5 space-y-3.5">
            {(pipelineByKam as any[]).length === 0 ? <Empty msg="Sin cotizaciones activas" /> :
              (pipelineByKam as any[]).map(k => (
                <Link key={k.name} to="/quotes" className="block group">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-700 font-medium group-hover:text-blue-600 transition-colors truncate">{k.name}</span>
                    <span className="text-gray-400 shrink-0 ml-2">{k.count} · {fmtCLP(k.value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(k.value / maxPipeline) * 100}%` }} />
                  </div>
                </Link>
              ))
            }
          </div>
        </Section>

        <Section title="Ganado este mes por KAM">
          <div className="p-5 space-y-3.5">
            {(wonByKam as any[]).length === 0 ? <Empty msg="Sin ventas este mes" /> :
              (wonByKam as any[]).map((k, i) => (
                <div key={k.name} className="flex items-center gap-3">
                  <span className={`text-sm font-bold w-5 shrink-0 ${i === 0 ? 'text-amber-400' : 'text-gray-300'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-700 font-medium truncate">{k.name}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{fmtCLP(k.value)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(k.value / maxWon) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Section title={`Cotizaciones sin actividad +30 días (${(staleQuotes as any[]).length})`} action={<SeeAll to="/quotes" />}>
          {(staleQuotes as any[]).length === 0 ? <Empty msg="Todo al día ✓" /> : (
            <ul className="divide-y">
              {(staleQuotes as any[]).map(q => (
                <li key={q.id}>
                  <Link to="/quotes" state={{ highlightId: q.id }}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{q.title || q.id}</p>
                      <p className="text-xs text-gray-400 truncate">{q.company?.name} · {q.kam?.full_name}</p>
                    </div>
                    <span className="shrink-0 text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                      {STAGE_LABEL[q.stage] ?? q.stage}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Cotizaciones enviadas vencidas (${(expiredQuotes as any[]).length})`} action={<SeeAll to="/quotes" />}>
          {(expiredQuotes as any[]).length === 0 ? <Empty msg="Sin cotizaciones vencidas ✓" /> : (
            <ul className="divide-y">
              {(expiredQuotes as any[]).map(q => (
                <li key={q.id}>
                  <Link to="/quotes" state={{ highlightId: q.id }}
                    className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-gray-400">{q.quote_number}</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{q.title || q.company?.name}</p>
                      <p className="text-xs text-gray-400">{q.kam?.full_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {(q.total ?? 0) > 0 && <p className="text-sm font-semibold text-gray-800">{fmtTotal(q.total, q.currency)}</p>}
                      <p className="text-xs text-red-500">Venció {fmtDate(q.valid_until)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Actividad reciente" action={<SeeAll to="/calls" />}>
        {(recentCalls as any[]).length === 0 ? <Empty msg="Sin actividad reciente" /> : (
          <div className="grid grid-cols-2 divide-x">
            {[(recentCalls as any[]).slice(0, 4), (recentCalls as any[]).slice(4, 8)].map((half, col) => (
              <ul key={col} className="divide-y">
                {half.map((c: any) => (
                  <li key={c.id}>
                    <Link to="/calls" className="flex items-center gap-2 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <span className="text-sm shrink-0">{TYPE_ICON[c.type] ?? '📞'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.company?.name}</p>
                        <p className="text-xs text-gray-400">{c.kam?.full_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-medium ${OUTCOME_COLOR[c.outcome]}`}>{OUTCOME_LABEL[c.outcome]}</p>
                        <p className="text-xs text-gray-400">{fmtDate(c.called_at)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth()
  if (authLoading || !profile)
    return <div className="flex items-center justify-center py-24 text-sm text-gray-400">Cargando...</div>
  if (profile.role === 'super_admin') return <AdminDashboard profile={profile} />
  return <KamDashboard profile={profile} />
}
