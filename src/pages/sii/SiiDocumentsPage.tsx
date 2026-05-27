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
import {
  partitionVentas,
  sortNotaCreditoVentaGroups,
  sortSalesDocuments,
  VENTAS_SORT_OPTIONS,
  type NotaCreditoVentaGroup,
  type VentasSortBy,
  type VentasSubTabId,
} from '@/lib/siiSalesSubtabs'
import {
  computeSiiPurchasePaymentStatus,
  fetchSiiPurchasePaidTotals,
} from '@/lib/bankSiiPurchaseLink'
import {
  computeSiiSalesCollectionStatus,
  fetchSiiSalesCollectedTotals,
} from '@/lib/bankSiiSalesLink'
import SiiBankStatusBadge from '@/components/sii/SiiBankStatusBadge'
import type { SiiPurchaseDocument, SiiSalesDocument } from '@/types'

const SII_PURCHASE_PAYMENTS_QUERY_KEY = 'sii-document-purchase-payments'
const SII_SALES_COLLECTIONS_QUERY_KEY = 'sii-document-sales-collections'

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

  const [tab, setTab] = useState<TabId>('ventas')
  const [comprasSubTab, setComprasSubTab] = useState<ComprasSubTabId>('documentos')
  const [comprasSort, setComprasSort] = useState<ComprasSortBy>('fecha_desc')
  const [ventasSubTab, setVentasSubTab] = useState<VentasSubTabId>('documentos')
  const [ventasSort, setVentasSort] = useState<VentasSortBy>('fecha_desc')
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

  const purchaseIds = useMemo(
    () => [...new Set((purchasesQ.data ?? []).map(d => d.id))].sort(),
    [purchasesQ.data],
  )

  const purchasePaymentsQ = useQuery({
    queryKey: [SII_PURCHASE_PAYMENTS_QUERY_KEY, purchaseIds],
    queryFn: async () => {
      try {
        return await fetchSiiPurchasePaidTotals(purchaseIds)
      } catch {
        return new Map<string, number>()
      }
    },
    enabled: purchaseIds.length > 0,
  })

  const salesIds = useMemo(
    () => [...new Set((salesQ.data ?? []).map(d => d.id))].sort(),
    [salesQ.data],
  )

  const salesCollectionsQ = useQuery({
    queryKey: [SII_SALES_COLLECTIONS_QUERY_KEY, salesIds],
    queryFn: async () => {
      try {
        return await fetchSiiSalesCollectedTotals(salesIds)
      } catch {
        return new Map<string, number>()
      }
    },
    enabled: salesIds.length > 0,
  })

  const paidByPurchaseId = purchasePaymentsQ.data ?? new Map<string, number>()
  const collectedBySalesId = salesCollectionsQ.data ?? new Map<string, number>()

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

  const ventasPartition = useMemo(
    () => (salesQ.data ? partitionVentas(salesQ.data) : null),
    [salesQ.data],
  )

  const sortedVentasDocumentos = useMemo(
    () => (ventasPartition ? sortSalesDocuments(ventasPartition.documentos, ventasSort) : []),
    [ventasPartition, ventasSort],
  )

  const sortedVentasGuias = useMemo(
    () => (ventasPartition ? sortSalesDocuments(ventasPartition.guiasDespacho, ventasSort) : []),
    [ventasPartition, ventasSort],
  )

  const sortedNotasCreditoVentas = useMemo(
    () =>
      ventasPartition ? sortNotaCreditoVentaGroups(ventasPartition.notasCredito, ventasSort) : [],
    [ventasPartition, ventasSort],
  )

  const tabBtn = (id: TabId, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(id)
        if (id === 'compras') setComprasSubTab('documentos')
        if (id === 'ventas') setVentasSubTab('documentos')
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

  const ventasSubTabBtn = (id: VentasSubTabId, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setVentasSubTab(id)}
      className={cn(
        'px-2.5 py-1 text-xs rounded-md transition-colors',
        ventasSubTab === id ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100',
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
            Registro de compras, ventas y boletas de honorarios. Importe el RCV de{' '}
            <span className="font-medium">Ventas</span> (facturas emitidas) o{' '}
            <span className="font-medium">Compras</span> (facturas recibidas) desde el portal del SII.
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

            {tab === 'ventas' && ventasPartition && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
                <div className="flex flex-wrap gap-2">
                  {ventasSubTabBtn('documentos', 'Documentos', ventasPartition.documentos.length)}
                  {ventasSubTabBtn('notas_credito', 'Notas de crédito', ventasPartition.notasCredito.length)}
                  {ventasSubTabBtn('guias_despacho', 'Guías de despacho', ventasPartition.guiasDespacho.length)}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500 shrink-0">Ordenar</Label>
                  <select
                    value={ventasSort}
                    onChange={e => setVentasSort(e.target.value as VentasSortBy)}
                    className="h-8 rounded-md border border-gray-200 px-2 text-xs"
                  >
                    {VENTAS_SORT_OPTIONS.map(o => (
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
              bankStatus="pago"
            >
              {sortedComprasDocumentos.map(row => (
                <PurchaseRow
                  key={row.id}
                  row={row}
                  paidAmount={paidByPurchaseId.get(row.id) ?? 0}
                />
              ))}
            </DocumentsTable>
          )}

          {tab === 'compras' && purchasesQ.data && comprasPartition && comprasSubTab === 'notas_credito' && (
            <NotasCreditoTable groups={sortedNotasCredito} paidByDocumentId={paidByPurchaseId} />
          )}

          {tab === 'compras' && purchasesQ.data && comprasPartition && comprasSubTab === 'guias_despacho' && (
            <DocumentsTable
              empty="Sin guías de despacho en el período."
              rows={sortedComprasGuias.length}
              bankStatus="pago"
            >
              {sortedComprasGuias.map(row => (
                <PurchaseRow
                  key={row.id}
                  row={row}
                  paidAmount={paidByPurchaseId.get(row.id) ?? 0}
                />
              ))}
            </DocumentsTable>
          )}

          {tab === 'ventas' && salesQ.data && ventasPartition && ventasSubTab === 'documentos' && (
            <DocumentsTable
              empty="Sin documentos de venta en el período (facturas y similares)."
              rows={sortedVentasDocumentos.length}
              bankStatus="cobro"
            >
              {sortedVentasDocumentos.map(row => (
                <SalesRow
                  key={row.id}
                  row={row}
                  collectedAmount={collectedBySalesId.get(row.id) ?? 0}
                />
              ))}
            </DocumentsTable>
          )}

          {tab === 'ventas' && salesQ.data && ventasPartition && ventasSubTab === 'notas_credito' && (
            <NotasCreditoVentaTable
              groups={sortedNotasCreditoVentas}
              collectedByDocumentId={collectedBySalesId}
            />
          )}

          {tab === 'ventas' && salesQ.data && ventasPartition && ventasSubTab === 'guias_despacho' && (
            <DocumentsTable
              empty="Sin guías de despacho en el período."
              rows={sortedVentasGuias.length}
              bankStatus="cobro"
            >
              {sortedVentasGuias.map(row => (
                <SalesRow
                  key={row.id}
                  row={row}
                  collectedAmount={collectedBySalesId.get(row.id) ?? 0}
                />
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

function CompanyLink({ companyId, href }: { companyId: string | null; href?: string }) {
  if (!companyId) return <>—</>
  return (
    <Link to={href ?? `/companies/${companyId}`} className="text-blue-600 hover:underline">
      Empresa
    </Link>
  )
}

function SalesFollowupLink({
  companyId,
  salesDocumentId,
}: {
  companyId: string | null
  salesDocumentId: string
}) {
  if (!companyId) return <>—</>
  return (
    <div className="flex flex-col gap-0.5">
      <Link to={`/companies/${companyId}`} className="text-blue-600 hover:underline">
        Empresa
      </Link>
      <Link
        to={`/companies/${companyId}/v2?siiSalesId=${encodeURIComponent(salesDocumentId)}#seccion-seguimientos`}
        className="text-violet-700 hover:underline"
      >
        Abrir seguimiento
      </Link>
    </div>
  )
}

function PurchaseRow({
  row,
  paidAmount = 0,
  muted,
}: {
  row: SiiPurchaseDocument
  paidAmount?: number
  muted?: boolean
}) {
  const bankStatus = computeSiiPurchasePaymentStatus(Number(row.monto_total), paidAmount)

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
      <TableCell>
        <SiiBankStatusBadge label={bankStatus.label} tone={bankStatus.tone} mode="pago" />
      </TableCell>
      <TableCell className="text-xs text-gray-500">{row.estado_rcv ?? '—'}</TableCell>
      <TableCell className="text-xs">
        <SalesFollowupLink companyId={row.company_id} salesDocumentId={row.id} />
      </TableCell>
    </TableRow>
  )
}

function SalesRow({
  row,
  collectedAmount = 0,
  muted,
}: {
  row: SiiSalesDocument
  collectedAmount?: number
  muted?: boolean
}) {
  const bankStatus = computeSiiSalesCollectionStatus(Number(row.monto_total), collectedAmount)

  return (
    <TableRow className={muted ? 'bg-gray-50/80' : undefined}>
      <TableCell className="whitespace-nowrap">{fmtDate(row.fecha_emision)}</TableCell>
      <TableCell>
        <span className={muted ? 'text-gray-500' : undefined}>
          {siiDteTypeLabel(row.tipo_dte)} · {row.folio}
        </span>
      </TableCell>
      <TableCell>
        <div className="font-mono text-xs">{row.rut_receptor}</div>
        <div className="text-xs text-gray-500 truncate max-w-[14rem]">{row.razon_social_receptor}</div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtMoney(row.monto_total)}</TableCell>
      <TableCell>
        <SiiBankStatusBadge label={bankStatus.label} tone={bankStatus.tone} mode="cobro" />
      </TableCell>
      <TableCell className="text-xs text-gray-500">{row.estado_rcv ?? '—'}</TableCell>
      <TableCell className="text-xs">
        <CompanyLink companyId={row.company_id} />
      </TableCell>
    </TableRow>
  )
}

function NotasCreditoVentaTable({
  groups,
  collectedByDocumentId,
}: {
  groups: NotaCreditoVentaGroup[]
  collectedByDocumentId: Map<string, number>
}) {
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
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Factura afectada</TableHead>
            <TableHead>Cobro</TableHead>
            <TableHead>Estado SII</TableHead>
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
                    <div className="font-mono text-xs text-gray-600">{factura.rut_receptor}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[14rem]">{factura.razon_social_receptor}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-700">{fmtMoney(factura.monto_total)}</TableCell>
                  <TableCell className="text-xs text-gray-400">—</TableCell>
                  <TableCell>
                    {(() => {
                      const st = computeSiiSalesCollectionStatus(
                        Number(factura.monto_total),
                        collectedByDocumentId.get(factura.id) ?? 0,
                      )
                      return <SiiBankStatusBadge label={st.label} tone={st.tone} mode="cobro" />
                    })()}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{factura.estado_rcv ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    <SalesFollowupLink companyId={factura.company_id} salesDocumentId={factura.id} />
                  </TableCell>
                </TableRow>
              )}
              <TableRow key={`n-${nota.id}`} className={factura ? 'border-t border-dashed border-gray-200' : undefined}>
                <TableCell className="whitespace-nowrap">{fmtDate(nota.fecha_emision)}</TableCell>
                <TableCell>
                  <span className="text-[10px] uppercase tracking-wide text-amber-700 font-medium mr-1">NC</span>
                  {siiDteTypeLabel(nota.tipo_dte)} · {nota.folio}
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{nota.rut_receptor}</div>
                  <div className="text-xs text-gray-500 truncate max-w-[14rem]">{nota.razon_social_receptor}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(nota.monto_total)}</TableCell>
                <TableCell className="text-xs">
                  {factura ? (
                    <span>
                      {siiDteTypeLabel(factura.tipo_dte)} · {factura.folio}
                    </span>
                  ) : folioReferencia ? (
                    <span className="text-amber-700">Folio {folioReferencia} (fuera del período)</span>
                  ) : (
                    <span className="text-gray-400">Sin referencia</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-gray-400">—</TableCell>
                <TableCell className="text-xs text-gray-500">{nota.estado_rcv ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  <SalesFollowupLink companyId={nota.company_id} salesDocumentId={nota.id} />
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function NotasCreditoTable({
  groups,
  paidByDocumentId,
}: {
  groups: NotaCreditoGroup[]
  paidByDocumentId: Map<string, number>
}) {
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
            <TableHead>Pago</TableHead>
            <TableHead>Estado SII</TableHead>
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
                  <TableCell>
                    {(() => {
                      const st = computeSiiPurchasePaymentStatus(
                        Number(factura.monto_total),
                        paidByDocumentId.get(factura.id) ?? 0,
                      )
                      return <SiiBankStatusBadge label={st.label} tone={st.tone} mode="pago" />
                    })()}
                  </TableCell>
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
                <TableCell className="text-xs text-gray-400">—</TableCell>
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
  bankStatus,
}: {
  children: ReactNode
  empty: string
  rows: number
  honorarium?: boolean
  bankStatus?: 'pago' | 'cobro'
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
            {bankStatus && <TableHead>{bankStatus === 'pago' ? 'Pago' : 'Cobro'}</TableHead>}
            <TableHead>Estado SII</TableHead>
            <TableHead>CRM</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  )
}
