import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchInvoicesList,
  invoicesListQueryKey,
  deleteInvoice,
  companyInvoiceFollowupHref,
  type InvoiceListRow,
} from '@/lib/invoicesQuery'
import { INVOICE_STATUS_LABEL } from '@/lib/invoiceDisplay'
import InvoiceFormDialog from '@/components/invoices/InvoiceFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/hooks/useAuth'
import { Building2, Pencil, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_CLASS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  pendiente: 'bg-amber-100 text-amber-800',
  pagada: 'bg-green-100 text-green-700',
  anulada: 'bg-red-100 text-red-700',
  nota_credito: 'bg-violet-100 text-violet-800',
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editInvoice, setEditInvoice] = useState<InvoiceListRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const companyFilter = searchParams.get('company')
  const invoiceFromQuery = searchParams.get('invoice')

  const canEdit = profile?.role !== 'reader'

  const { data: invoices = [], isLoading, error } = useQuery({
    queryKey: invoicesListQueryKey(),
    queryFn: fetchInvoicesList,
  })

  const selected = useMemo(
    () => invoices.find(i => i.id === selectedId) ?? null,
    [invoices, selectedId],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return invoices.filter(inv => {
      if (companyFilter && inv.company_id !== companyFilter) return false
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (!term) return true
      return (
        inv.invoice_number.toLowerCase().includes(term)
        || (inv.title ?? '').toLowerCase().includes(term)
        || (inv.companies?.name ?? '').toLowerCase().includes(term)
        || (inv.quotes?.quote_number ?? '').toLowerCase().includes(term)
        || (inv.notes ?? '').toLowerCase().includes(term)
      )
    })
  }, [invoices, search, statusFilter, companyFilter])

  const companyLabel = useMemo(() => {
    if (!companyFilter) return null
    return invoices.find(inv => inv.company_id === companyFilter)?.companies?.name ?? null
  }, [companyFilter, invoices])

  useEffect(() => {
    if (!invoiceFromQuery) return
    if (selectedId === invoiceFromQuery) return
    const exists = invoices.some(inv => inv.id === invoiceFromQuery)
    if (exists) setSelectedId(invoiceFromQuery)
  }, [invoiceFromQuery, invoices, selectedId])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length }
    for (const inv of invoices) {
      c[inv.status] = (c[inv.status] ?? 0) + 1
    }
    return c
  }, [invoices])

  async function handleDeleteSelected() {
    if (!selected || !canEdit) return
    if (
      !window.confirm(
        `¿Eliminar la factura ${selected.invoice_number}? Se borrará el PDF adjunto.`,
      )
    ) {
      return
    }
    setDeletingId(selected.id)
    try {
      await deleteInvoice(selected.id)
      setSelectedId(null)
      void queryClient.invalidateQueries({ queryKey: invoicesListQueryKey() })
    } catch (e) {
      alert((e as Error).message ?? 'No se pudo eliminar.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Facturas</h1>
          <p className="text-sm text-gray-500">
            Folios SII, glosa y PDF. Al hacer clic en una fila irá al seguimiento comercial de esa factura en la ficha empresa.
          </p>
        </div>
        {selected?.companies?.id && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
            <Link to={companyInvoiceFollowupHref(selected.companies.id, selected.id)}>
              <Building2 size={15} />
              Seguimiento comercial
            </Link>
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {companyFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2">
          <span className="text-xs text-blue-900">
            Filtrando por empresa: <strong>{companyLabel ?? companyFilter}</strong>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('company')
              next.delete('invoice')
              setSelectedId(null)
              setSearchParams(next)
            }}
          >
            Ver todas
          </Button>
        </div>
      )}

      {selected && canEdit && (
        <div className="flex flex-wrap gap-2 items-center rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
          <span className="text-xs text-violet-900">
            Seleccionada: <strong className="font-mono">{selected.invoice_number}</strong>
            {selected.companies?.name ? ` · ${selected.companies.name}` : ''}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditInvoice(selected)}>
            <Pencil size={12} /> Editar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
            disabled={deletingId === selected.id}
            onClick={() => void handleDeleteSelected()}
          >
            <Trash2 size={12} /> Eliminar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input
            className="pl-8 h-9 w-64 text-sm"
            placeholder="N° factura, glosa, empresa, cotización…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {[
            ['all', `Todas (${counts.all ?? 0})`],
            ['pendiente', `Pendientes (${counts.pendiente ?? 0})`],
            ['pagada', `Pagadas (${counts.pagada ?? 0})`],
            ['anulada', `Anuladas (${counts.anulada ?? 0})`],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                statusFilter === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">Cargando…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">Sin facturas</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° SII</TableHead>
                <TableHead>Glosa</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Cotización</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                {canEdit && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(inv => (
                <TableRow
                  key={inv.id}
                  className={cn(
                    'cursor-pointer',
                    selectedId === inv.id && 'bg-violet-50/90',
                  )}
                  onClick={() => {
                    setSelectedId(inv.id)
                    if (inv.companies?.id) {
                      navigate(companyInvoiceFollowupHref(inv.companies.id, inv.id))
                    }
                  }}
                >
                  <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm" title={inv.title ?? ''}>
                    {inv.title ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                    {inv.companies?.id ? (
                      <Link
                        to={companyInvoiceFollowupHref(inv.companies.id, inv.id)}
                        className="text-violet-700 hover:underline"
                      >
                        {inv.companies.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {inv.quotes?.quote_number ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {Number(inv.total).toLocaleString('es-CL')} {inv.currency}
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLASS[inv.status] ?? 'bg-gray-100')}>
                      {INVOICE_STATUS_LABEL[inv.status as keyof typeof INVOICE_STATUS_LABEL] ?? inv.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(inv.created_at).toLocaleDateString('es-CL', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </TableCell>
                  {canEdit && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Editar factura"
                        onClick={() => {
                          setSelectedId(inv.id)
                          setEditInvoice(inv)
                        }}
                      >
                        <Pencil size={14} className="text-gray-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {editInvoice && (
        <InvoiceFormDialog
          open
          mode="edit"
          invoice={editInvoice}
          canDelete={canEdit}
          onClose={() => setEditInvoice(null)}
          onCompleted={() => {
            void queryClient.invalidateQueries({ queryKey: invoicesListQueryKey() })
            setEditInvoice(null)
          }}
          onDeleted={() => {
            setSelectedId(null)
            void queryClient.invalidateQueries({ queryKey: invoicesListQueryKey() })
          }}
        />
      )}
    </div>
  )
}
