import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Search, MapPin } from 'lucide-react'

interface InventoryRow {
  id: string
  serial_number: string
  status: string
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

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, products(name, sku)')
        .order('updated_at', { ascending: false })
      if (error) throw error
      setItems((data as InventoryRow[]) ?? [])
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
      (i.installed_address ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const counts = {
    all:        items.length,
    disponible: items.filter(i => i.status === 'disponible').length,
    reservado:  items.filter(i => i.status === 'reservado').length,
    vendido:    items.filter(i => i.status === 'vendido').length,
    dañado:     items.filter(i => i.status === 'dañado').length,
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500">{filtered.length} unidades</p>
        </div>
      </div>

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
              <th className="px-4 py-3 text-left">N° de serie</th>
              <th className="px-4 py-3 text-left">Notas</th>
              <th className="px-4 py-3 text-left">Ubicación / Destino</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-left">Última actualización</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin resultados</td></tr>
            ) : filtered.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{item.products?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{item.products?.sku ?? '—'}</td>
                <td className="px-4 py-3 font-mono">{item.serial_number}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{item.notes ?? '—'}</td>
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(item.updated_at).toLocaleDateString('es-CL', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}