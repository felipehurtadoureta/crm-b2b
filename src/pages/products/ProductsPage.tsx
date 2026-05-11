import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Package, Wrench, Pencil, Archive, Trash2 } from 'lucide-react'
import type { Product } from '@/types'
import ProductDialog from './ProductDialog'

function formatPrice(price: number, currency: string) {
  if (currency === 'CLP') return `$${price.toLocaleString('es-CL')}`
  if (currency === 'USD') return `USD ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  return `UF ${price.toLocaleString('es-CL', { minimumFractionDigits: 2 })}`
}

export default function ProductsPage() {
  const [products, setProducts]         = useState<Product[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [dialogOpen, setDialogOpen]     = useState(false)
  const [selected, setSelected]         = useState<Product | null>(null)

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('products').select('*').order('name')
      if (statusFilter === 'active')   q = q.eq('is_active', true)
      if (statusFilter === 'inactive') q = q.eq('is_active', false)
      if (typeFilter !== 'all')        q = q.eq('type', typeFilter)
      const { data, error } = await q
      if (error) throw error
      setProducts(data ?? [])
    } catch (err) {
      console.error('Error cargando productos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [typeFilter, statusFilter])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.service_category ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setSelected(null); setDialogOpen(true) }
  function openEdit(p: Product) { setSelected(p); setDialogOpen(true) }

  async function toggleActive(p: Product) {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    load()
  }

  async function deleteProduct(p: Product) {
    const message = p.has_inventory
      ? `¿Eliminar "${p.name}"?\n\nEsto eliminará también todos sus seriales e historial de precios.\nEsta acción no se puede deshacer.`
      : `¿Eliminar "${p.name}"?\n\nSe eliminará también su historial de precios.\nEsta acción no se puede deshacer.`

    if (!confirm(message)) return
    try {
      const { error } = await supabase.from('products').delete().eq('id', p.id)
      if (error) throw error
      load()
    } catch (err) {
      console.error('Error eliminando producto:', err)
      alert('No se pudo eliminar el producto.')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500">{filtered.length} productos</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus size={15} /> Nuevo producto
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input
            className="pl-8 h-9 w-56 text-sm"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="flex rounded-md border overflow-hidden text-sm">
          {[['all','Todos'],['product','Producto'],['service','Servicio']].map(([v,l]) => (
            <button
              key={v}
              onClick={() => setTypeFilter(v)}
              className={`px-3 py-1.5 transition-colors ${typeFilter === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex rounded-md border overflow-hidden text-sm">
          {[['active','Activos'],['inactive','Inactivos'],['all','Todos']].map(([v,l]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 transition-colors ${statusFilter === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Producto</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Categoría</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.sku ?? '—'}</td>
                <td className="px-4 py-3">
                  {p.type === 'product' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      <Package size={11} />
                      {p.has_inventory ? 'Producto · Stock' : 'Producto · Sin stock'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <Wrench size={11} />
                      Servicio
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.service_category ?? '—'}</td>
                <td className="px-4 py-3 text-right font-medium">{formatPrice(p.price, p.currency)}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={p.is_active ? 'default' : 'secondary'}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}>
                      <Pencil size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400" onClick={() => toggleActive(p)}>
                      <Archive size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-300 hover:text-red-500" onClick={() => deleteProduct(p)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductDialog
        open={dialogOpen}
        product={selected}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </div>
  )
}