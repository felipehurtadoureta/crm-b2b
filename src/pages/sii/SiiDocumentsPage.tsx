/**
 * Documentos tributarios SII: RCV compras/ventas y boletas de honorarios.
 */
import { useMemo, useState, Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Settings2, Upload } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchSiiConnections, SII_CONNECTIONS_QUERY_KEY } from '@/lib/siiConnectionsQuery'
import {
  fetchSiiHonorariumReceipts,
  fetchSiiPurchaseDocuments,
  fetchSiiSalesDocuments,
  SII_HONORARIUM_QUERY_KEY,
  SII_PURCHASES_QUERY_KEY,
  SII_SALES_QUERY_KEY,
  siiDteTypeLabel,
} from '@/lib/siiDocumentsQuery'
import { cn } from '@/lib/utils'
import SiiImportDialog from '@/components/sii/SiiImportDialog'
import {
  COMPRAS_SORT_OPTIONS,
  partitionCompras,
  sortNotaCreditoGroups,
  sortPurchaseDocuments,
  type ComprasSortBy,
  type ComprasSubTabId,
  type NotaCreditoGroup,
} from '@/lib/siiPurchaseSubtabs'
import type { SiiPurchaseDocument } from '@/types'

type TabId = 'compras' | 'ventas' | 'honorarios'

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CL') : '—')

function currentYm() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ymMonthsAgo(n: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function SiiDocumentsPage() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [tab, setTab] = useState<TabId>('compras')
  const [comprasSubTab, setComprasSubTab] = useState<ComprasSubTabId>('documentos')
  const [comprasSort, setComprasSort] = useState<ComprasSortBy>('fecha_desc')
  const [connectionId, setConnectionId] = useState('')
  const [periodFrom, setPeriodFrom] = useState(() => ymMonthsAgo(2))
  const [periodTo, setPeriodTo] = useState(currentYm)
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  const connectionsQ = useQuery({
    queryKey: SII_CONNECTIONS_QUERY_KEY,
    queryFn: fetchSiiConnections,
  })

  const activeConnections = useMemo(
    () => (connectionsQ.data ?? []).filter(c => c.is_active),
    [connectionsQ.data],
  )

  const effectiveConnectionId = connectionId || activeConnections[0]?.id || ''
  const filter = useMemo(
    () => ({
      connectionId: effectiveConnectionId || undefined,
      periodFrom,
      periodTo,
      search,
    }),
    [effectiveConnectionId, periodFrom, periodTo, search],
  )

  const purchasesQ = useQuery({
    queryKey: [...SII_PURCHASES_QUERY_KEY, filter],
    queryFn: () => fetchSiiPurchaseDocuments(filter),
    enabled: tab === 'compras' && Boolean(effectiveConnectionId),
  })

  const salesQ = useQuery({
    queryKey: [...SII_SALES_QUERY_KEY, filter],
    queryFn: () => fetchSiiSalesDocuments(filter),
    enabled: tab === 'ventas' && Boolean(effectiveConnectionId),
  })

  const honorariumQ = useQuery({
    queryKey: [...SII_HONORARIUM_QUERY_KEY, filter],
    queryFn: () => fetchSiiHonorariumReceipts(filter),
    enabled: tab === 'honorarios' && Boolean(effectiveConnectionId),
  })

  const activeQuery = tab === 'compras' ? purchasesQ : tab === 'ventas' ? salesQ : honorariumQ

  const comprasPartition = useMemo(
    () => (purchasesQ.data ? partitionCompras(purchasesQ.data) : null),
    [purchasesQ.data],
  )

  const sortedComprasDocumentos = useMemo(
    () =>
      comprasPartition ? sortPurchaseDocuments(comprasPartition.documentos, comprasSort) : [],
    [comprasPartition, comprasSort],
  )

  const sortedComprasGuias = useMemo(
    () =>
      comprasPartition ? sortPurchaseDocuments(comprasPartition.guiasDespacho, comprasSort) : [],
    [comprasPartition, comprasSort],
  )

  const sortedNotasCredito = useMemo(
    () =>
      comprasPartition ? sortNotaCreditoGroups(comprasPartition.notasCredito, comprasSort) : [],
    [comprasPartition, comprasSort],
  )

  const tabBtn = (id: TabId, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(id)
        if (id === 'compras') setComprasSubTab('documentos')
      }}
      className={cn(
        'px-3 py-1.5 text-sm rounded-md transition-colors',
        tab === id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100',
      )}
    >
      {label}
    </button>
  )

  const comprasSubTabBtn = (id: ComprasSubTabId, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setComprasSubTab(id)}
      className={cn(
        'px-2.5 py-1 text-xs rounded-md transition-colors',
        comprasSubTab === id ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100',
      )}
    >
      {label}
      {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documentos tributarios (SII)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Registro de compras, ventas y boletas de honorarios. Descargue el RCV en el portal del SII e impórtelo con el
            botón «Importar archivo».
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={!effectiveConnectionId}
                onClick={() => setImportOpen(true)}
              >
                <Upload size={14} />
                Importar archivo
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
                <Link to="/admin/users?tab=organization">
                  <Settings2 size={14} />
                  Conexiones
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {connectionsQ.isLoading && <p className="text-sm text-gray-400">Cargando conexiones…</p>}

      {connectionsQ.isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {connectionsQ.error instanceof Error ? connectionsQ.error.message : 'Error'}
        </div>
      )}

      {connectionsQ.data && activeConnections.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
          No hay conexiones SII activas.{' '}
          {isSuperAdmin ? (
            <>
              Configure una en{' '}
              <Link to="/admin/users?tab=organization" className="text-blue-600 hover:underline">
                Organización → Conexiones SII
              </Link>
              .
            </>
          ) : (
            'Solicite a un administrador que configure la conexión.'
          )}
        </div>
      )}

      {activeConnections.length > 0 && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[12rem]">
                <Label className="text-xs">Contribuyente</Label>
                <select
                  value={effectiveConnectionId}
                  onChange={e => setConnectionId(e.target.value)}
                  className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
                >
                  {activeConnections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.legal_name} ({c.rut})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <input
                  type="month"
                  value={periodFrom}
                  onChange={e => setPeriodFrom(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 px-3 text-sm block"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <input
                  type="month"
                  value={periodTo}
                  onChange={e => setPeriodTo(e.target.value)}
                  className="h-9 rounded-md border border-gray-200 px-3 text-sm block"
                />
              </div>
              <Input
                placeholder="Buscar RUT, razón social o folio…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-xs h-9"
              />
            </div>

            <div className="flex gap-2">{tabBtn('compras', 'Compras')}{tabBtn('ventas', 'Ventas')}{tabBtn('honorarios', 'Honorarios')}</div>

            {tab === 'compras' && comprasPartition && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
                <div className="flex flex-wrap gap-2">
                  {comprasSubTabBtn('documentos', 'Documentos', comprasPartition.documentos.length)}
                  {comprasSubTabBtn('notas_credito', 'Notas de crédito', comprasPartition.notasCredito.length)}
                  {comprasSubTabBtn('guias_despacho', 'Guías de despacho', comprasPartition.guiasDespacho.length)}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500 shrink-0">Ordenar</Label>
                  <select
                    value={comprasSort}
                    onChange={e => setComprasSort(e.target.value as ComprasSortBy)}
                    className="h-8 rounded-md border border-gray-200 px-2 text-xs"
                  >
                    {COMPRAS_SORT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {activeQuery.isLoading && <p className="text-sm text-gray-500">Cargando documentos…</p>}

          {activeQuery.isError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {activeQuery.error instanceof Error ? activeQuery.error.message : 'Error al cargar'}
            </div>
          )}

          {tab === 'compras' && purchasesQ.data && comprasPartition && comprasSubTab === 'documentos' && (
            <DocumentsTable
              empty="Sin documentos de compra en el período (facturas y similares)."
              rows={sortedComprasDocumentos.length}
            >
              {sortedComprasDocumentos.map(row => (
                <PurchaseRow key={row.id} row={row} />
              ))}
            </DocumentsTable>
          )}

          {tab === 'compras' && purchasesQ.data && comprasPartition && comprasSubTab === 'notas_credito' && (
            <NotasCreditoTable groups={sortedNotasCredito} />
          )}

          {tab === 'compras' && purchasesQ.data && comprasPartition && comprasSubTab === 'guias_despacho' && (
            <DocumentsTable
              empty="Sin guías de despacho en el período."
              rows={sortedComprasGuias.length}
            >
              {sortedComprasGuias.map(row => (
                <PurchaseRow key={row.id} row={row} />
              ))}
            </DocumentsTable>
          )}

          {tab === 'ventas' && salesQ.data && (
            <DocumentsTable
              empty="Sin ventas en el período. Use «Importar archivo» con el CSV/Excel del SII."
              rows={salesQ.data.length}
            >
              {salesQ.data.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(row.fecha_emision)}</TableCell>
                  <TableCell>
                    {siiDteTypeLabel(row.tipo_dte)} · {row.folio}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{row.rut_receptor}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[14rem]">{row.razon_social_receptor}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(row.monto_total)}</TableCell>
                  <TableCell className="text-xs text-gray-500">{row.estado_rcv ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {row.company_id ? (
                      <Link to={`/companies/${row.company_id}`} className="text-blue-600 hover:underline">
                        Empresa
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </DocumentsTable>
          )}

          {tab === 'honorarios' && honorariumQ.data && (
            <DocumentsTable
              empty="Sin boletas en el período. Importe el archivo correspondiente desde el SII."
              rows={honorariumQ.data.length}
              honorarium
            >
              {honorariumQ.data.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(row.fecha)}</TableCell>
                  <TableCell>
                    {row.tipo_boleta} · {row.numero_boleta}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{row.rut_prestador}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[14rem]">{row.nombre_prestador}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(row.liquido)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-gray-500">{fmtMoney(row.retencion)}</TableCell>
                  <TableCell className="text-xs text-gray-500">{row.estado ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {row.company_id ? (
                      <Link to={`/companies/${row.company_id}`} className="text-blue-600 hover:underline">
                        Empresa
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </DocumentsTable>
          )}
        </>
      )}

      {effectiveConnectionId && (
        <SiiImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          connectionId={effectiveConnectionId}
          importType={tab}
          defaultPeriodo={periodTo}
        />
      )}
    </div>
  )
}

function CompanyLink({ companyId }: { companyId: string | null }) {
  if (!companyId) return <>—</>
  return (
    <Link to={`/companies/${companyId}`} className="text-blue-600 hover:underline">
      Empresa
    </Link>
  )
}

function PurchaseRow({ row, muted }: { row: SiiPurchaseDocument; muted?: boolean }) {
  return (
    <TableRow className={muted ? 'bg-gray-50/80' : undefined}>
      <TableCell className="whitespace-nowrap">{fmtDate(row.fecha_emision)}</TableCell>
      <TableCell>
        <span className={muted ? 'text-gray-500' : undefined}>
          {siiDteTypeLabel(row.tipo_dte)} · {row.folio}
        </span>
      </TableCell>
      <TableCell>
        <div className="font-mono text-xs">{row.rut_emisor}</div>
        <div className="text-xs text-gray-500 truncate max-w-[14rem]">{row.razon_social_emisor}</div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtMoney(row.monto_total)}</TableCell>
      <TableCell className="text-xs text-gray-500">{row.estado_rcv ?? '—'}</TableCell>
      <TableCell className="text-xs">
        <CompanyLink companyId={row.company_id} />
      </TableCell>
    </TableRow>
  )
}

function NotasCreditoTable({ groups }: { groups: NotaCreditoGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        Sin notas de crédito en el período. Las facturas anuladas o con NC aparecerán aquí vinculadas a su nota.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Contraparte</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Factura afectada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>CRM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(({ nota, factura, folioReferencia }) => (
            <Fragment key={nota.id}>
              {factura && (
                <TableRow key={`f-${factura.id}`} className="bg-blue-50/40 border-b-0">
                  <TableCell className="whitespace-nowrap text-gray-600">{fmtDate(factura.fecha_emision)}</TableCell>
                  <TableCell className="text-gray-600">
                    <span className="text-[10px] uppercase tracking-wide text-blue-700 font-medium mr-1">Factura</span>
                    {siiDteTypeLabel(factura.tipo_dte)} · {factura.folio}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-gray-600">{factura.rut_emisor}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[14rem]">{factura.razon_social_emisor}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-700">{fmtMoney(factura.monto_total)}</TableCell>
                  <TableCell className="text-xs text-gray-400">—</TableCell>
                  <TableCell className="text-xs text-gray-500">{factura.estado_rcv ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    <CompanyLink companyId={factura.company_id} />
                  </TableCell>
                </TableRow>
              )}
              <TableRow key={`n-${nota.id}`} className={factura ? 'border-t border-dashed border-gray-200' : undefined}>
                <TableCell className="whitespace-nowrap">{fmtDate(nota.fecha_emision)}</TableCell>
                <TableCell>
                  <span className="text-[10px] uppercase tracking-wide text-amber-800 font-medium mr-1">NC</span>
                  {siiDteTypeLabel(nota.tipo_dte)} · {nota.folio}
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{nota.rut_emisor}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[14rem]">{nota.razon_social_emisor}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(nota.monto_total)}</TableCell>
                <TableCell className="text-xs">
                  {factura ? (
                    <span className="text-gray-700">
                      {siiDteTypeLabel(factura.tipo_dte)} {factura.folio}
                    </span>
                  ) : folioReferencia ? (
                    <span className="text-gray-600">Factura Nº {folioReferencia}</span>
                  ) : (
                    <span className="text-amber-700">Sin referencia</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-gray-500">{nota.estado_rcv ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  <CompanyLink companyId={nota.company_id} />
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DocumentsTable({
  children,
  empty,
  rows,
  honorarium,
}: {
  children: ReactNode
  empty: string
  rows: number
  honorarium?: boolean
}) {
  if (rows === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">{empty}</p>
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Contraparte</TableHead>
            <TableHead className="text-right">{honorarium ? 'Líquido' : 'Total'}</TableHead>
            {honorarium && <TableHead className="text-right">Retención</TableHead>}
            <TableHead>Estado</TableHead>
            <TableHead>CRM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  )
}
