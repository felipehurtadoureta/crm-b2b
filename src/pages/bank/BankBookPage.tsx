/**
 * Libro de banco — movimientos importados desde cartola Banco de Chile (Excel).
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Landmark, Settings2, Upload } from 'lucide-react'
import { fetchBankTransactions, lastDayOfMonthYm, BANK_BOOK_SETUP_HINT } from '@/lib/bankBookQuery'
import { BANK_GLOSAS_QUERY_KEY, bankGlosaLabel, fetchBankGlosas } from '@/lib/bankGlosas'
import { useAuth } from '@/hooks/useAuth'
import BankCartolaImportDialog from '@/components/bank/BankCartolaImportDialog'
import BankTransactionGlosaSelect from '@/components/bank/BankTransactionGlosaSelect'
import BankTransactionNoteInput from '@/components/bank/BankTransactionNoteInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { BankTransactionRow } from '@/lib/bankBookQuery'
import type { BankGlosa } from '@/lib/bankGlosas'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fmtFecha = (s: string) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CL') : '—'

function currentYm() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ymMonthsAgo(n: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type PeriodMode = 'single' | 'range'
type DateSort = 'desc' | 'asc'

function matchesSearch(
  t: BankTransactionRow,
  q: string,
  glosaLabel: string,
  glosas: BankGlosa[],
): boolean {
  const term = q.trim().toLowerCase()
  if (!term) return true

  if (t.description?.toLowerCase().includes(term)) return true
  if (glosaLabel.toLowerCase().includes(term)) return true
  if (t.glosa?.toLowerCase().includes(term)) return true
  const glosaRow = glosas.find(g => g.code === t.glosa)
  if (glosaRow?.name.toLowerCase().includes(term)) return true
  if (t.notes?.toLowerCase().includes(term)) return true

  const digits = term.replace(/\D/g, '')
  if (digits.length >= 2) {
    const debit = String(Math.round(Number(t.debit ?? 0)))
    const credit = String(Math.round(Number(t.credit ?? 0)))
    if (debit.includes(digits) || credit.includes(digits)) return true
  }

  const amountNum = parseInt(term.replace(/\./g, '').replace(/\s/g, ''), 10)
  if (Number.isFinite(amountNum) && amountNum > 0) {
    if (Math.round(Number(t.debit ?? 0)) === amountNum) return true
    if (Math.round(Number(t.credit ?? 0)) === amountNum) return true
  }

  return false
}

export default function BankBookPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [importOpen, setImportOpen] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [dateSort, setDateSort] = useState<DateSort>('desc')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('range')
  const [mes, setMes] = useState(currentYm)
  const [mesDesde, setMesDesde] = useState(() => ymMonthsAgo(2))
  const [mesHasta, setMesHasta] = useState(currentYm)

  const dateFrom = periodMode === 'single' ? `${mes}-01` : `${mesDesde}-01`
  const dateTo = periodMode === 'single' ? lastDayOfMonthYm(mes) : lastDayOfMonthYm(mesHasta)
  const queryScopeKey = `${periodMode}|${dateFrom}|${dateTo}`

  const glosasQ = useQuery({
    queryKey: BANK_GLOSAS_QUERY_KEY,
    queryFn: () => fetchBankGlosas({ activeOnly: true }),
  })

  const txQ = useQuery({
    queryKey: ['bank-transactions', queryScopeKey],
    queryFn: () => fetchBankTransactions({ dateFrom, dateTo }),
  })

  const filtradas = useMemo(() => {
    const list = txQ.data ?? []
    const glosas = glosasQ.data ?? []
    const filtered = list.filter(t =>
      matchesSearch(t, filtro, bankGlosaLabel(t.glosa), glosas),
    )

    return [...filtered].sort((a, b) => {
      const cmp = a.movement_date.localeCompare(b.movement_date)
      if (cmp !== 0) return dateSort === 'asc' ? cmp : -cmp
      return dateSort === 'asc'
        ? a.created_at.localeCompare(b.created_at)
        : b.created_at.localeCompare(a.created_at)
    })
  }, [txQ.data, filtro, glosasQ.data, dateSort])

  const totalAbonos = filtradas.reduce((s, t) => s + Number(t.credit ?? 0), 0)
  const totalCargos = filtradas.reduce((s, t) => s + Number(t.debit ?? 0), 0)
  const sinGlosa = filtradas.filter(t => !t.glosa).length

  const canImport = profile?.role === 'super_admin'
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'kam'
  const canAdminGlosas = profile?.role === 'super_admin'

  const periodLabel =
    periodMode === 'single'
      ? mes
      : `${mesDesde} → ${mesHasta}`

  const toggleDateSort = () => setDateSort(s => (s === 'desc' ? 'asc' : 'desc'))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-800 p-2.5 text-white">
            <Landmark size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Libro de banco</h1>
            <p className="text-sm text-gray-500 mt-0.5">Cartola Banco de Chile (Excel)</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdminGlosas && (
            <Button type="button" variant="outline" className="gap-2" asChild>
              <Link to="/bank/glosas">
                <Settings2 size={16} />
                Glosas
              </Link>
            </Button>
          )}
          {canImport && (
            <Button type="button" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload size={16} />
              Importar cartolas
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Abonos</p>
          <p className="text-xl font-semibold text-green-700 mt-1">{fmt(totalAbonos)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cargos</p>
          <p className="text-xl font-semibold text-red-700 mt-1">{fmt(totalCargos)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Flujo neto</p>
          <p
            className={`text-xl font-semibold mt-1 ${totalAbonos - totalCargos >= 0 ? 'text-green-700' : 'text-red-700'}`}
          >
            {fmt(totalAbonos - totalCargos)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Movimientos</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{filtradas.length}</p>
          {sinGlosa > 0 && (
            <p className="text-xs text-amber-700 mt-0.5">{sinGlosa} sin glosa</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
        <p className="text-sm font-medium text-gray-800">Período</p>
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="period"
              checked={periodMode === 'range'}
              onChange={() => setPeriodMode('range')}
            />
            Varios meses
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="period"
              checked={periodMode === 'single'}
              onChange={() => setPeriodMode('single')}
            />
            Un mes
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {periodMode === 'range' ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <input
                  type="month"
                  value={mesDesde}
                  onChange={e => setMesDesde(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 px-3 text-sm block"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <input
                  type="month"
                  value={mesHasta}
                  onChange={e => setMesHasta(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 px-3 text-sm block"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <input
                type="month"
                value={mes}
                onChange={e => setMes(e.target.value)}
                className="h-9 rounded-md border border-gray-200 px-3 text-sm block"
              />
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void txQ.refetch()}>
            Actualizar
          </Button>
        </div>
        <p className="text-xs text-gray-500">Mostrando: {periodLabel}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por monto, glosa o descripción…"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {txQ.isLoading && <p className="text-sm text-gray-500">Cargando movimientos…</p>}

      {txQ.isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {txQ.error instanceof Error ? txQ.error.message : 'Error al cargar'}
          {(txQ.error instanceof Error ? txQ.error.message : '').includes('bank') && (
            <p className="mt-2 text-xs">{BANK_BOOK_SETUP_HINT}</p>
          )}
        </div>
      )}

      {!txQ.isLoading && !txQ.isError && filtradas.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-gray-600">No hay movimientos para este período.</p>
          {canImport && (
            <Button type="button" variant="link" className="mt-2" onClick={() => setImportOpen(true)}>
              Importar cartola
            </Button>
          )}
        </div>
      )}

      {filtradas.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                <th className="px-4 py-2.5 font-medium">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-slate-200"
                    onClick={toggleDateSort}
                  >
                    Fecha
                    {dateSort === 'desc' ? (
                      <ArrowDown size={14} aria-hidden />
                    ) : (
                      <ArrowUp size={14} aria-hidden />
                    )}
                  </button>
                </th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="px-4 py-2.5 font-medium min-w-[11rem]">Glosa</th>
                <th className="px-4 py-2.5 font-medium text-right">Cargo</th>
                <th className="px-4 py-2.5 font-medium text-right">Abono</th>
                <th className="px-4 py-2.5 font-medium min-w-[10rem]">Nota</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((t, i) => (
                <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 whitespace-nowrap">{fmtFecha(t.movement_date)}</td>
                  <td className="px-4 py-2 max-w-md" title={t.description}>
                    <span className="line-clamp-2">{t.description}</span>
                  </td>
                  <td className="px-4 py-2 align-top">
                    {canEdit ? (
                      <BankTransactionGlosaSelect transactionId={t.id} value={t.glosa} />
                    ) : (
                      <span className="text-gray-600 text-xs">
                        {bankGlosaLabel(t.glosa)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-red-700 tabular-nums">
                    {Number(t.debit) > 0 ? fmt(Number(t.debit)) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-green-700 tabular-nums">
                    {Number(t.credit) > 0 ? fmt(Number(t.credit)) : '—'}
                  </td>
                  <td className="px-4 py-2 align-top">
                    {canEdit ? (
                      <BankTransactionNoteInput transactionId={t.id} value={t.notes} />
                    ) : (
                      <span className="text-gray-600 text-xs whitespace-pre-wrap">
                        {t.notes?.trim() || '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BankCartolaImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })}
      />
    </div>
  )
}
