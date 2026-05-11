import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Profile } from '@/types'
import {
  TrendingUp, FileText, AlertTriangle, Building2,
  Award, ChevronRight,
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10)

const startOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n)

const fmtDate = (d: string) =>
  new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short',
  })

const fmtTotal = (total: number, currency: string) => {
  if (currency === 'CLP') return fmtCLP(total)
  if (currency === 'USD') return `US$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `UF ${total.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

const STAGE_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', en_negociacion: 'Negociación',
  propuesta_enviada: 'Propuesta', ganado: 'Ganado', perdido: 'Perdido',
}
const STAGE_BAR: Record<string, string> = {
  nuevo: 'bg-sky-400', en_negociacion: 'bg-violet-400', propuesta_enviada: 'bg-amber-400',
}
const TYPE_ICON: Record<string, string> = {
  llamada: '📞', whatsapp: '💬', email: '✉️', reunion: '👥', visita: '📍',
}
const OUTCOME_LABEL: Record<string, string> = {
  sin_resultado: 'Sin resultado', interesado: 'Interesado',
  no_interesado: 'No interesado', requiere_seguimiento: 'Seguimiento',
  cotizacion_solicitada: 'Cotiz. solicitada', venta_cerrada: 'Venta cerrada',
}
const OUTCOME_COLOR: Record<string, string> = {
  sin_resultado: 'text-gray-400', interesado: 'text-green-600',
  no_interesado: 'text-red-500', requiere_seguimiento: 'text-yellow-600',
  cotizacion_solicitada: 'text-blue-600', venta_cerrada: 'text-purple-600',
}

// ─── ui primitives ────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color = 'text-gray-500', alert = false,
}: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color?: string; alert?: boolean
}) {
  const isAlertActive = alert && typeof value === 'number' && value > 0
  return (
    <div className={`bg-white rounded-xl border p-5 flex items-start gap-4 ${isAlertActive ? 'border-red-200 bg-red-50' : ''}`}>
      <div className={`p-2.5 rounded-lg shrink-0 ${isAlertActive ? 'bg-red-100' : 'bg-gray-100'}`}>
        <Icon size={20} className={isAlertActive ? 'text-red-500' : color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5 leading-tight">{label}</p>
        <p className={`text-xl font-bold leading-tight ${isAlertActive ? 'text-red-600' : 'text-gray-900'}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function Section({
  title, children, action,
}: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
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

function SeeAll({ to }: { to: string }) {
  return (
    <Link to={to} className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
      Ver todos <ChevronRight size={12} />
    </Link>
  )
}

function Empty({ msg = 'Sin datos' }: { msg?: string }) {
  return <p className="px-5 py-5 text-sm text-gray-400">{msg}</p>
}

// ─── KAM Dashboard ────────────────────────────────────────────────────────────
function KamDashboard({ profile }: { profile: Profile }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, []) // eslint-disable-line

  async function load() {
    const t   = todayStr()
    const som = startOfMonth()
    const in30 = inDays(30)
    const id  = profile.id

    const [
      { data: activeDeals },
      { data: wonDeals },
      { data: overdueActs },
      { data: upcomingActs },
      { data: sentQuotes },
      { data: closingSoon },
      { data: recentCalls },
      { data: overdueFollowups },
    ] = await Promise.all([
      supabase.from('deals')
        .select('id, stage, expected_value, currency, title, company:companies(name)')
        .eq('kam_id', id).not('stage', 'in', '(ganado,perdido)'),

      supabase.from('deals')
        .select('id, expected_value')
        .eq('kam_id', id).eq('stage', 'ganado').gte('closed_at', som),

      supabase.from('activities')
        .select('id, title, due_date, type')
        .eq('kam_id', id).in('status', ['pendiente', 'en_progreso'])
        .lt('due_date', t).order('due_date', { ascending: true }).limit(5),

      supabase.from('activities')
        .select('id, title, due_date, type')
        .eq('kam_id', id).in('status', ['pendiente', 'en_progreso'])
        .gte('due_date', t).lte('due_date', in30)
        .order('due_date', { ascending: true }).limit(6),

      supabase.from('quotes')
        .select('id, quote_number, total, currency, valid_until, company:companies(name)')
        .eq('kam_id', id).eq('status', 'enviada')
        .order('created_at', { ascending: false }),

      supabase.from('deals')
        .select('id, title, expected_close, expected_value, currency, company:companies(name)')
        .eq('kam_id', id).not('stage', 'in', '(ganado,perdido)')
        .gte('expected_close', t).lte('expected_close', in30)
        .order('expected_close', { ascending: true }).limit(5),

      supabase.from('calls')
        .select('id, called_at, type, outcome, company:companies(name), contact:contacts(first_name,last_name)')
        .eq('kam_id', id).order('called_at', { ascending: false }).limit(6),

      supabase.from('calls')
        .select('id, next_contact_date, company:companies(name)')
        .eq('kam_id', id).not('next_contact_date', 'is', null)
        .lt('next_contact_date', t).order('next_contact_date', { ascending: true }).limit(5),
    ])

    // Pipeline por etapa
    const byStage: Record<string, { count: number; value: number }> = {}
    for (const d of (activeDeals ?? [])) {
      if (!byStage[d.stage]) byStage[d.stage] = { count: 0, value: 0 }
      byStage[d.stage].count++
      byStage[d.stage].value += d.expected_value ?? 0
    }

    setData({
      activeDeals:      activeDeals ?? [],
      totalPipeline:    (activeDeals ?? []).reduce((s: number, d: any) => s + (d.expected_value ?? 0), 0),
      byStage,
      totalWon:         (wonDeals ?? []).reduce((s: number, d: any) => s + (d.expected_value ?? 0), 0),
      overdueActs:      overdueActs ?? [],
      upcomingActs:     upcomingActs ?? [],
      sentQuotes:       sentQuotes ?? [],
      closingSoon:      closingSoon ?? [],
      recentCalls:      recentCalls ?? [],
      overdueFollowups: overdueFollowups ?? [],
    })
    setLoading(false)
  }

  if (loading) {
    return <div className="text-gray-400 text-sm py-16 text-center">Cargando dashboard...</div>
  }

  const { activeDeals, totalPipeline, byStage, totalWon, overdueActs,
    upcomingActs, sentQuotes, closingSoon, recentCalls, overdueFollowups } = data

  const ACTIVE_STAGES = ['nuevo', 'en_negociacion', 'propuesta_enviada'] as const
  const maxVal = Math.max(...ACTIVE_STAGES.map(s => byStage[s]?.value ?? 0), 1)
  const t = todayStr()

  return (
    <div className="space-y-6">

      {/* Saludo */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Hola, {profile.full_name.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pipeline activo"
          value={fmtCLP(totalPipeline)}
          sub={`${activeDeals.length} negocio${activeDeals.length !== 1 ? 's' : ''}`}
          icon={TrendingUp} color="text-blue-500"
        />
        <StatCard
          label="Ganado este mes"
          value={fmtCLP(totalWon)}
          icon={Award} color="text-emerald-500"
        />
        <StatCard
          label="Tareas vencidas"
          value={overdueActs.length}
          icon={AlertTriangle} alert
        />
        <StatCard
          label="Cotiz. esperando respuesta"
          value={sentQuotes.length}
          icon={FileText} color="text-violet-500"
        />
      </div>

      {/* Pipeline + Seguimientos vencidos */}
      <div className="grid grid-cols-3 gap-4">

        <div className="col-span-2">
          <Section title="Pipeline por etapa">
            <div className="p-5 space-y-3.5">
              {ACTIVE_STAGES.map(stage => {
                const s = byStage[stage] ?? { count: 0, value: 0 }
                return (
                  <div key={stage}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-600 font-medium">{STAGE_LABEL[stage]}</span>
                      <span className="text-gray-400">
                        {s.count} negocio{s.count !== 1 ? 's' : ''} · {fmtCLP(s.value)}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${STAGE_BAR[stage]}`}
                        style={{ width: `${(s.value / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {activeDeals.length === 0 && <Empty msg="Sin negocios activos" />}
            </div>
          </Section>
        </div>

        <Section title={`Seguimientos vencidos (${overdueFollowups.length})`}>
          {overdueFollowups.length === 0 ? (
            <p className="px-5 py-5 text-sm text-gray-400">Todo al día ✓</p>
          ) : (
            <ul className="divide-y">
              {overdueFollowups.map((c: any) => (
                <li key={c.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.company?.name}</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Vencido el {fmtDate(c.next_contact_date)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Cierres próximos + Tareas */}
      <div className="grid grid-cols-2 gap-4">

        <Section title="Cierres próximos — 30 días" action={<SeeAll to="/deals" />}>
          {closingSoon.length === 0 ? (
            <Empty msg="Sin cierres próximos" />
          ) : (
            <ul className="divide-y">
              {closingSoon.map((d: any) => (
                <li key={d.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.title}</p>
                    <p className="text-xs text-gray-400">{d.company?.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {d.expected_value != null && (
                      <p className="text-sm font-semibold text-gray-800">{fmtCLP(d.expected_value)}</p>
                    )}
                    <p className="text-xs text-amber-600">{fmtDate(d.expected_close)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`Tareas pendientes${overdueActs.length > 0 ? ` · ${overdueActs.length} vencidas` : ''}`}
        >
          {overdueActs.length === 0 && upcomingActs.length === 0 ? (
            <Empty msg="Sin tareas pendientes" />
          ) : (
            <ul className="divide-y">
              {overdueActs.map((a: any) => (
                <li key={a.id} className="px-5 py-2.5 flex items-center gap-3">
                  <span className="text-[10px] bg-red-100 text-red-600 rounded px-1.5 py-0.5 shrink-0 font-medium">
                    VENCIDA
                  </span>
                  <p className="text-xs font-medium text-gray-900 flex-1 truncate">{a.title}</p>
                  <p className="text-xs text-red-500 shrink-0">{fmtDate(a.due_date)}</p>
                </li>
              ))}
              {upcomingActs.map((a: any) => (
                <li key={a.id} className="px-5 py-2.5 flex items-center gap-3">
                  <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 shrink-0">
                    {a.type}
                  </span>
                  <p className="text-xs font-medium text-gray-900 flex-1 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400 shrink-0">{fmtDate(a.due_date)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Últimas interacciones + Cotizaciones enviadas */}
      <div className="grid grid-cols-2 gap-4">

        <Section title="Últimas interacciones" action={<SeeAll to="/calls" />}>
          {recentCalls.length === 0 ? (
            <Empty msg="Sin interacciones recientes" />
          ) : (
            <ul className="divide-y">
              {recentCalls.map((c: any) => (
                <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-base shrink-0">{TYPE_ICON[c.type] ?? '📞'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.company?.name}</p>
                    {c.contact && (
                      <p className="text-xs text-gray-400">
                        {c.contact.first_name} {c.contact.last_name}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-medium ${OUTCOME_COLOR[c.outcome]}`}>
                      {OUTCOME_LABEL[c.outcome]}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(c.called_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Cotizaciones esperando respuesta" action={<SeeAll to="/quotes" />}>
          {sentQuotes.length === 0 ? (
            <Empty msg="Sin cotizaciones pendientes" />
          ) : (
            <ul className="divide-y">
              {sentQuotes.slice(0, 6).map((q: any) => (
                <li key={q.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-gray-400">{q.quote_number}</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{q.company?.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {fmtTotal(q.total, q.currency)}
                    </p>
                    {q.valid_until && (
                      <p className={`text-xs ${q.valid_until < t ? 'text-red-500' : 'text-gray-400'}`}>
                        {q.valid_until < t ? 'Vencida' : `Vence ${fmtDate(q.valid_until)}`}
                      </p>
                    )}
                  </div>
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
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, []) // eslint-disable-line

  async function load() {
    const t    = todayStr()
    const som  = startOfMonth()
    const ago30 = daysAgo(30)

    const [
      { data: companies },
      { data: allDeals },
      { data: wonThisMonth },
      { data: allQuotes },
      { data: companyKams },
      { data: staleDeals },
      { data: recentCalls },
      { data: expiredQuotes },
    ] = await Promise.all([
      supabase.from('companies').select('id, status'),

      supabase.from('deals')
        .select('id, stage, expected_value, currency, title, kam_id, company:companies(name), kam:profiles(full_name)')
        .not('stage', 'in', '(ganado,perdido)'),

      supabase.from('deals')
        .select('id, expected_value, kam_id, kam:profiles(full_name)')
        .eq('stage', 'ganado').gte('closed_at', som),

      supabase.from('quotes').select('id, status, total, currency'),

      supabase.from('company_kams').select('company_id'),

      supabase.from('deals')
        .select('id, title, stage, updated_at, company:companies(name), kam:profiles(full_name)')
        .not('stage', 'in', '(ganado,perdido)')
        .lt('updated_at', ago30)
        .order('updated_at', { ascending: true })
        .limit(6),

      supabase.from('calls')
        .select('id, called_at, type, outcome, company:companies(name), kam:profiles(full_name)')
        .order('called_at', { ascending: false })
        .limit(8),

      supabase.from('quotes')
        .select('id, quote_number, valid_until, total, currency, company:companies(name), kam:profiles(full_name)')
        .eq('status', 'enviada').not('valid_until', 'is', null)
        .lt('valid_until', t)
        .order('valid_until', { ascending: true })
        .limit(6),
    ])

    // Empresas sin KAM
    const kamCompIds = new Set((companyKams ?? []).map((r: any) => r.company_id))
    const activeCompanies = (companies ?? []).filter((c: any) => c.status === 'activo')
    const withoutKamCount = activeCompanies.filter((c: any) => !kamCompIds.has(c.id)).length

    // Pipeline por KAM
    const pipelineByKam: Record<string, { name: string; value: number; count: number }> = {}
    for (const d of (allDeals ?? [])) {
      const id = d.kam_id ?? '__none__'
      const name = (d as any).kam?.full_name ?? 'Sin KAM'
      if (!pipelineByKam[id]) pipelineByKam[id] = { name, value: 0, count: 0 }
      pipelineByKam[id].value += d.expected_value ?? 0
      pipelineByKam[id].count++
    }

    // Ganado por KAM
    const wonByKam: Record<string, { name: string; value: number; count: number }> = {}
    for (const d of (wonThisMonth ?? [])) {
      const id = d.kam_id ?? '__none__'
      const name = (d as any).kam?.full_name ?? 'Sin KAM'
      if (!wonByKam[id]) wonByKam[id] = { name, value: 0, count: 0 }
      wonByKam[id].value += d.expected_value ?? 0
      wonByKam[id].count++
    }

    setData({
      activeCount:   activeCompanies.length,
      withoutKamCount,
      totalPipeline: (allDeals ?? []).reduce((s: number, d: any) => s + (d.expected_value ?? 0), 0),
      openDeals:     (allDeals ?? []).length,
      totalWon:      (wonThisMonth ?? []).reduce((s: number, d: any) => s + (d.expected_value ?? 0), 0),
      sentCount:     (allQuotes ?? []).filter((q: any) => q.status === 'enviada').length,
      pipelineByKam: Object.values(pipelineByKam).sort((a: any, b: any) => b.value - a.value),
      wonByKam:      Object.values(wonByKam).sort((a: any, b: any) => b.value - a.value),
      staleDeals:    staleDeals ?? [],
      recentCalls:   recentCalls ?? [],
      expiredQuotes: expiredQuotes ?? [],
    })
    setLoading(false)
  }

  if (loading) {
    return <div className="text-gray-400 text-sm py-16 text-center">Cargando dashboard...</div>
  }

  const {
    activeCount, withoutKamCount, totalPipeline, openDeals, totalWon,
    sentCount, pipelineByKam, wonByKam, staleDeals, recentCalls, expiredQuotes,
  } = data

  const maxPipeline = Math.max(...pipelineByKam.map((k: any) => k.value), 1)
  const maxWon      = Math.max(...wonByKam.map((k: any) => k.value), 1)

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Empresas activas"  value={activeCount}          icon={Building2}     color="text-blue-500" />
        <StatCard label="Pipeline total"    value={fmtCLP(totalPipeline)} sub={`${openDeals} negocios`} icon={TrendingUp} color="text-violet-500" />
        <StatCard label="Ganado este mes"   value={fmtCLP(totalWon)}     icon={Award}         color="text-emerald-500" />
        <StatCard label="Cotiz. enviadas"   value={sentCount}             icon={FileText}      color="text-amber-500" />
        <StatCard label="Empresas sin KAM"  value={withoutKamCount}       icon={AlertTriangle} alert />
      </div>

      {/* Pipeline + Ganado por KAM */}
      <div className="grid grid-cols-2 gap-4">

        <Section title="Pipeline activo por KAM">
          <div className="p-5 space-y-3.5">
            {pipelineByKam.length === 0 ? (
              <Empty msg="Sin negocios activos" />
            ) : pipelineByKam.map((k: any) => (
              <div key={k.name}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-700 font-medium truncate">{k.name}</span>
                  <span className="text-gray-400 shrink-0 ml-2">
                    {k.count} · {fmtCLP(k.value)}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${(k.value / maxPipeline) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Ganado este mes por KAM">
          <div className="p-5 space-y-3.5">
            {wonByKam.length === 0 ? (
              <Empty msg="Sin ventas este mes" />
            ) : wonByKam.map((k: any, i: number) => (
              <div key={k.name} className="flex items-center gap-3">
                <span className={`text-sm font-bold w-5 shrink-0 ${i === 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-700 font-medium truncate">{k.name}</span>
                    <span className="text-gray-500 shrink-0 ml-2">{fmtCLP(k.value)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${(k.value / maxWon) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Alertas */}
      <div className="grid grid-cols-2 gap-4">

        <Section
          title={`Negocios sin actividad +30 días (${staleDeals.length})`}
          action={<SeeAll to="/deals" />}
        >
          {staleDeals.length === 0 ? (
            <Empty msg="Sin negocios estancados ✓" />
          ) : (
            <ul className="divide-y">
              {staleDeals.map((d: any) => (
                <li key={d.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {d.company?.name} · {d.kam?.full_name}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                    {STAGE_LABEL[d.stage]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`Cotizaciones enviadas vencidas (${expiredQuotes.length})`}
          action={<SeeAll to="/quotes" />}
        >
          {expiredQuotes.length === 0 ? (
            <Empty msg="Sin cotizaciones vencidas ✓" />
          ) : (
            <ul className="divide-y">
              {expiredQuotes.map((q: any) => (
                <li key={q.id} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono text-gray-400">{q.quote_number}</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{q.company?.name}</p>
                    <p className="text-xs text-gray-400">{q.kam?.full_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {fmtTotal(q.total, q.currency)}
                    </p>
                    <p className="text-xs text-red-500">Venció {fmtDate(q.valid_until)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Actividad reciente */}
      <Section title="Actividad reciente" action={<SeeAll to="/calls" />}>
        {recentCalls.length === 0 ? (
          <Empty msg="Sin actividad reciente" />
        ) : (
          <div className="grid grid-cols-2 divide-x">
            {[recentCalls.slice(0, 4), recentCalls.slice(4, 8)].map((half: any[], col) => (
              <ul key={col} className="divide-y">
                {half.map((c: any) => (
                  <li key={c.id} className="px-5 py-3 flex items-center gap-2">
                    <span className="text-sm shrink-0">{TYPE_ICON[c.type] ?? '📞'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.company?.name}</p>
                      <p className="text-xs text-gray-400">{c.kam?.full_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-medium ${OUTCOME_COLOR[c.outcome]}`}>
                        {OUTCOME_LABEL[c.outcome]}
                      </p>
                      <p className="text-xs text-gray-400">{fmtDate(c.called_at)}</p>
                    </div>
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

// ─── Default export ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile, loading: authLoading } = useAuth()

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Cargando...
      </div>
    )
  }

  if (profile.role === 'super_admin') return <AdminDashboard profile={profile} />
  return <KamDashboard profile={profile} />
}