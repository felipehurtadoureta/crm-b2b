import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, MapPin, ChevronDown, ChevronRight, Pencil, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Product } from '@/types'
import ProductDialog from './ProductDialog'
import InventoryExcelImportDialog from './InventoryExcelImportDialog'

import { useFabricacionPendiente } from '@/hooks/useFabricacionPendiente'

interface InventoryRow {
  id: string
  product_id: string
  serial_number: string
  status: string
  custody?: string
  reference_price?: number | null
  reference_currency?: string | null
  notes?: string
  destination_notes?: string
  installed_address?: string
  created_at: string
  updated_at: string
  products: {
    name: string
    sku?: string
  }
}

const CUSTODY_LABEL: Record<string, string> = {
  bodega: 'Bodega',
  en_cliente: 'En cliente',
  prestamo: 'Préstamo',
  transito: 'Tránsito',
}

interface ProductGroup {
  productId: string
  name: string
  sku?: string
  items: InventoryRow[]
  total: number
  disponibles: number
}

const STATUS_COLOR: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  reservado:  'bg-yellow-100 text-yellow-700',
  vendido:    'bg-gray-100 text-gray-500',
  dañado:     'bg-red-100 text-red-700',
}

const STATUS_LABEL: Record<string, string> = {
  disponible: 'Disponible',
  reservado:  'Reservado',
  vendido:    'Vendido',
  dañado:     'Dañado',
}

export default function InventoryPage() {
  const [items, setItems]               = useState<InventoryRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expanded, setExpanded]       = useState<Set<string>>(() => new Set())
  const [dialogOpen, setDialogOpen]             = useState(false)
  const [importExcelOpen, setImportExcelOpen]   = useState(false)
  const [productToEdit, setProductToEdit] = useState<Product | null>(null)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(
          'id, product_id, serial_number, status, custody, reference_price, reference_currency, notes, destination_notes, installed_address, created_at, updated_at, products(name, sku)',
        )
        .order('updated_at', { ascending: false })
      if (error) throw error
      const parsed = ((data ?? []) as unknown[]).map(row => {
        const r = row as Record<string, unknown> & { products?: unknown }
        const p = r.products
        const productObj = Array.isArray(p) ? (p[0] as InventoryRow['products'] | undefined) : (p as InventoryRow['products'] | undefined)
        return {
          ...r,
          products: productObj ?? { name: '' },
        } as InventoryRow
      })
      setItems(parsed)
    } catch (err) {
      console.error('Error cargando inventario:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(i => {
    const matchStatus  = statusFilter === 'all' || i.status === statusFilter
    const matchSearch  =
      i.serial_number.toLowerCase().includes(search.toLowerCase()) ||
      (i.products?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (i.products?.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (i.installed_address ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (i.custody ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const groups = useMemo((): ProductGroup[] => {
    const m = new Map<string, InventoryRow[]>()
    for (const i of filtered) {
      const pid = i.product_id
      if (!m.has(pid)) m.set(pid, [])
      m.get(pid)!.push(i)
    }
    return Array.from(m.entries()).map(([productId, rows]) => ({
      productId,
      name: rows[0]?.products?.name ?? '—',
      sku:  rows[0]?.products?.sku,
      items: rows.sort((a, b) => a.serial_number.localeCompare(b.serial_number)),
      total: rows.length,
      disponibles: rows.filter(r => r.status === 'disponible').length,
    })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [filtered])

  const {
    data: fabricacionFilas,
    isLoading: cargandoFabricacion,
    error: errFabricacion,
  } = useFabricacionPendiente({ enabled: true })

  const fabricPorProducto = useMemo(() => {
    const map: Record<string, number> = {}
    for (const f of fabricacionFilas ?? []) map[f.productId] = f.qtyPendiente
    return map
  }, [fabricacionFilas])

  const counts = {
    all:        items.length,
    disponible: items.filter(i => i.status === 'disponible').length,
    reservado:  items.filter(i => i.status === 'reservado').length,
    vendido:    items.filter(i => i.status === 'vendido').length,
    dañado:     items.filter(i => i.status === 'dañado').length,
  }

  function toggleGroup(productId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  async function openEditProduct(productId: string) {
    const { data, error } = await supabase.from('products').select('*').eq('id', productId).maybeSingle()
    if (error || !data) {
      console.error(error)
      alert('No se pudo cargar el producto para editar.')
      return
    }
    setProductToEdit(data as Product)
    setDialogOpen(true)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500">
            {groups.length} producto{groups.length === 1 ? '' : 's'} · {filtered.length} unidad{filtered.length === 1 ? '' : 'es'}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setImportExcelOpen(true)}>
          <FileSpreadsheet size={15} /> Importar Excel
        </Button>
      </div>

      {errFabricacion && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No se pudieron cargar los pendientes de fabricación desde cotizaciones cerradas.
        </p>
      )}

      {!!fabricacionFilas?.length && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-slate-900">
            Fabricación pendiente (suma de todas las cotizaciones en estado aceptada u orden de venta)
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Cantidad pedida en líneas «stock» con inventario por serie, menos unidades ya enlazadas por número de serie.
            Si el número te sorprende, revisa si hay otra cotización en cierre que pide el mismo modelo o varias líneas del
            mismo producto.
          </p>
          <ul className="text-sm text-slate-800 space-y-2 list-disc ml-5">
            {fabricacionFilas.map(f => (
              <li key={f.productId}>
                <span className="font-medium">{f.productName}</span>: {f.qtyPendiente} unidad(es)
                {f.byQuote && f.byQuote.length > 0 && (
                  <ul className="mt-1 ml-3 list-[circle] space-y-0.5 text-xs text-slate-600">
                    {f.byQuote.map(s => (
                      <li key={s.quoteId}>
                        {s.quoteNumber || s.quoteId}: {s.qtyPendiente}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input
            className="pl-8 h-9 w-56 text-sm"
            placeholder="Serial, producto, dirección..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex rounded-md border overflow-hidden text-sm">
          {[
            ['all',        `Todos (${counts.all})`],
            ['disponible', `Disponibles (${counts.disponible})`],
            ['reservado',  `Reservados (${counts.reservado})`],
            ['vendido',    `Vendidos (${counts.vendido})`],
            ['dañado',     `Dañados (${counts.dañado})`],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 transition-colors ${statusFilter === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">Cargando...</p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">Sin resultados</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {groups.map(g => {
              const isOpen = expanded.has(g.productId)
              return (
                <div key={g.productId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleGroup(g.productId)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleGroup(g.productId)
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-3 bg-gray-50/80 hover:bg-gray-100/90 cursor-pointer text-left w-full transition-colors"
                  >
                    <span className="text-gray-500 shrink-0">
                      {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{g.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        SKU: {g.sku ?? '—'} · {g.total} en stock ({g.disponibles} disponibles)
                        {fabricPorProducto[g.productId] ? (
                          <span className="text-amber-800 font-medium">
                            {' '}
                            · Pendiente fabricar: {fabricPorProducto[g.productId]}
                          </span>
                        ) : null}
                      </p>
                      {(() => {
                        const det = fabricacionFilas?.find(f => f.productId === g.productId)
                        if (!det?.byQuote?.length) return null
                        return (
                          <p className="text-[11px] text-amber-900/85 mt-1 leading-snug">
                            {det.byQuote.map(s => `${s.quoteNumber}: ${s.qtyPendiente}`).join(' · ')}
                          </p>
                        )
                      })()}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 h-8"
                      onClick={e => {
                        e.stopPropagation()
                        void openEditProduct(g.productId)
                      }}
                    >
                      <Pencil size={13} />
                      Editar producto
                    </Button>
                  </div>

                  {isOpen && (
                    <div className="bg-white overflow-x-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-white text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                          <tr>
                            <th className="px-4 py-2 text-left pl-12">N° de serie</th>
                            <th className="px-4 py-2 text-left">Custodia</th>
                            <th className="px-4 py-2 text-left">Notas</th>
                            <th className="px-4 py-2 text-left">Ubicación / Destino</th>
                            <th className="px-4 py-2 text-center">Estado</th>
                            <th className="px-4 py-2 text-left">Actualizado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {g.items.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50/80">
                              <td className="px-4 py-2.5 pl-12 font-mono text-gray-900">{item.serial_number}</td>
                              <td className="px-4 py-2.5 text-gray-600 text-xs">
                                {CUSTODY_LABEL[item.custody ?? 'bodega'] ?? item.custody ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 max-w-[160px]">
                                <div className="truncate">{item.notes ?? '—'}</div>
                                {item.reference_price != null && (
                                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                                    Ref. {item.reference_currency ?? 'CLP'}{' '}
                                    {Number(item.reference_price).toLocaleString('es-CL')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {(item.installed_address || item.destination_notes) ? (
                                  <div className="flex items-start gap-1.5 text-gray-600">
                                    <MapPin size={12} className="mt-0.5 shrink-0 text-gray-400" />
                                    <span className="text-xs">
                                      {[item.installed_address, item.destination_notes].filter(Boolean).join(' — ')}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[item.status])}>
                                  {STATUS_LABEL[item.status] ?? item.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                                {new Date(item.updated_at).toLocaleDateString('es-CL', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <InventoryExcelImportDialog
        open={importExcelOpen}
        onOpenChange={setImportExcelOpen}
        onImported={() => void load()}
      />

      <ProductDialog
        open={dialogOpen}
        product={productToEdit}
        onClose={() => { setDialogOpen(false); setProductToEdit(null) }}
        onSaved={() => { void load() }}
      />
    </div>
  )
}
