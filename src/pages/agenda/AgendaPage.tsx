// Vista lista + mes: tareas CRM v2, cierres estimados y seguimientos comerciales (recordatorios)
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAgendaPendientes } from '@/hooks/useAgendaPendientes'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { bucketPendiente, type PendienteItem } from '@/lib/agendaPendientes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CalendarDays, LayoutList } from 'lucide-react'
import AgendaMonthOverview from '@/components/agenda/AgendaMonthOverview'
import AgendaMesDetalleRow from '@/components/agenda/AgendaMesDetalleRow'
import AgendaCompanySearch from '@/components/agenda/AgendaCompanySearch'

function grupoTitulo(k: ReturnType<typeof bucketPendiente>) {
  if (k === 'vencido') return 'Vencidos'
  if (k === 'hoy') return 'Hoy'
  if (k === 'semana') return 'Próximos 7 días'
  return 'Más adelante'
}

function tituloDiaLargo(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function AgendaPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const companyFilter = searchParams.get('company')
  const { profile } = useAuth()
  const canEditAgenda = profile?.role !== 'reader'

  const [vista, setVista] = useState<'lista' | 'mes'>('mes')
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })
  const [selectedMesDay, setSelectedMesDay] = useState<string | null>(null)

  const { items, loading, error } = useAgendaPendientes({
    companyId: companyFilter,
    enabled: true,
  })

  /** Nombre para el título cuando el listado aún no devolvió ítems pero hay `?company=` en la URL */
  const { data: nombreEmpresaDesdeBd } = useQuery({
    queryKey: ['company', 'agenda-titulo', companyFilter],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('companies').select('name').eq('id', companyFilter!).maybeSingle()
      if (err) throw new Error(err.message)
      return (data as { name: string } | null)?.name?.trim() ?? null
    },
    enabled: Boolean(companyFilter),
    staleTime: 120_000,
  })

  const nombreEmpresaFiltro = useMemo(() => {
    if (!companyFilter) return null
    const desdeItem = items.find(i => i.companyId === companyFilter)?.companyName?.trim()
    if (desdeItem) return desdeItem
    return nombreEmpresaDesdeBd
  }, [companyFilter, items, nombreEmpresaDesdeBd])

  const tituloPrincipal = useMemo(() => {
    if (!companyFilter) return 'Agenda'
    if (nombreEmpresaFiltro) return `Agenda Empresa ${nombreEmpresaFiltro}`
    return 'Agenda empresa'
  }, [companyFilter, nombreEmpresaFiltro])

  const hoyStr = new Date().toISOString().slice(0, 10)

  const grupos = useMemo(() => {
    const orden: ReturnType<typeof bucketPendiente>[] = ['vencido', 'hoy', 'semana', 'luego']
    const map = new Map<ReturnType<typeof bucketPendiente>, PendienteItem[]>()
    for (const k of orden) map.set(k, [])
    for (const p of items) {
      const b = bucketPendiente(p.fecha, hoyStr)
      map.get(b)!.push(p)
    }
    return orden.map(k => ({ key: k, titulo: grupoTitulo(k), items: map.get(k)! }))
  }, [items, hoyStr])

  const itemsDiaMes = useMemo(() => {
    if (!selectedMesDay) return []
    return items.filter(p => p.fecha.slice(0, 10) === selectedMesDay)
  }, [items, selectedMesDay])

  useEffect(() => {
    if (vista === 'lista') setSelectedMesDay(null)
  }, [vista])

  function aplicarFiltroEmpresa(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('company', id)
    setSearchParams(next, { replace: true })
  }

  function quitarFiltroEmpresa() {
    const next = new URLSearchParams(searchParams)
    next.delete('company')
    const s = next.toString()
    navigate(s ? `/agenda?${s}` : '/agenda', { replace: true })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <CalendarDays size={24} className="text-gray-500 shrink-0" />
            <span className="break-words">{tituloPrincipal}</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tareas del CRM (tabla <span className="font-mono text-gray-600">tasks</span>), cierres estimados de cotizaciones en pipeline
            y <span className="font-medium text-gray-700">seguimientos comerciales</span> (próximo contacto por llamados, cotización o factura).
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shrink-0">
          <Button
            type="button"
            variant={vista === 'lista' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setVista('lista')}
          >
            <LayoutList size={14} /> Lista
          </Button>
          <Button
            type="button"
            variant={vista === 'mes' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setVista('mes')}
          >
            <CalendarDays size={14} /> Mes
          </Button>
        </div>
      </div>

      <AgendaCompanySearch
        filteredCompanyId={companyFilter}
        filteredCompanyName={nombreEmpresaFiltro ?? null}
        onChooseCompany={aplicarFiltroEmpresa}
        onClearFilter={quitarFiltroEmpresa}
      />

      {loading && (
        <p className="text-sm text-gray-400 py-8 text-center">Cargando agenda…</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && vista === 'mes' && (
        <div className="space-y-4">
          <AgendaMonthOverview
            monthAnchor={monthAnchor}
            items={items}
            hoyStr={hoyStr}
            selectedDayStr={selectedMesDay}
            onSelectDay={setSelectedMesDay}
            onPrevMonth={() => {
              setSelectedMesDay(null)
              setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }}
            onNextMonth={() => {
              setSelectedMesDay(null)
              setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }}
            onGoToday={() => {
              setSelectedMesDay(null)
              const t = new Date()
              setMonthAnchor(new Date(t.getFullYear(), t.getMonth(), 1))
            }}
          />

          {selectedMesDay && (
            <section className="rounded-xl border border-violet-200 bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b bg-violet-50/80 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-violet-950 capitalize">
                  {tituloDiaLargo(selectedMesDay)}
                </h2>
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedMesDay(null)}>
                  Cerrar
                </Button>
              </div>
              <div className="p-2">
                {itemsDiaMes.length === 0 ? (
                  <p className="text-sm text-gray-500 px-2 py-4 text-center">No hay pendientes para este día.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {itemsDiaMes.map(p => (
                      <li key={p.key}>
                        <AgendaMesDetalleRow
                          p={p}
                          hoyStr={hoyStr}
                          profile={profile ?? undefined}
                          canEdit={canEditAgenda}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 text-sm">
          No hay pendientes en la ventana configurada (tareas CRM, cierres estimados o seguimientos con recordatorio).
          {companyFilter && (
            <>
              {' '}
              <Link to={`/companies/${companyFilter}/v2`} className="text-violet-700 font-medium hover:underline">
                Ver ficha de la empresa
              </Link>
              {' · '}
              <button type="button" className="text-violet-700 font-medium hover:underline" onClick={quitarFiltroEmpresa}>
                Quitar filtro
              </button>
            </>
          )}
        </div>
      )}

      {!loading && !error && items.length > 0 && vista === 'lista' && (
        <div className="space-y-8">
          {grupos.map(({ key, titulo, items: lista }) =>
            lista.length === 0 ? null : (
              <section key={key} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div
                  className={cn(
                    'px-4 py-2.5 border-b text-sm font-semibold flex items-center justify-between',
                    key === 'vencido' ? 'bg-red-50 text-red-900' :
                    key === 'hoy' ? 'bg-amber-50 text-amber-900' :
                    'bg-gray-50 text-gray-800',
                  )}
                >
                  <span>{titulo}</span>
                  <span className="text-xs font-normal text-gray-500">{lista.length}</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {lista.map(p => (
                    <li key={p.key}>
                      <AgendaMesDetalleRow
                        p={p}
                        hoyStr={hoyStr}
                        profile={profile ?? undefined}
                        canEdit={canEditAgenda}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  )
}
