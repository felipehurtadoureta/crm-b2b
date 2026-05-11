import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import SalesOrderDialog from './SalesOrderDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'pendiente' | 'confirmada' | 'entregada' | 'cancelada'

type OrderRow = {
  id: string
  order_number: string
  status: Status
  currency: 'CLP' | 'USD'
  total: number
  created_at: string
  company: { id: string; name: string } | null
  contact: { id: string; first_name: string; last_name: string } | null
  kam:     { id: string; full_name: string } | null
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-yellow-100 text-yellow-700' },
  confirmada: { label: 'Confirmada', cls: 'bg-blue-100   text-blue-700'   },
  entregada:  { label: 'Entregada',  cls: 'bg-green-100  text-green-700'  },
  cancelada:  { label: 'Cancelada',  cls: 'bg-red-100    text-red-700'    },
}

const fmt = (v: number, cur: string) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)

export default function SalesOrdersPage() {
  const { profile, loading: authLoading } = useAuth()
  const [orders,     setOrders]     = useState<OrderRow[]>([])
  const [fetching,   setFetching]   = useState(false)
  const [filter,     setFilter]     = useState<Status | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => { if (!authLoading) load() }, [authLoading]) // eslint-disable-line

  async function load() {
    setFetching(true)
    let q = supabase
      .from('sales_orders')
      .select('id,order_number,status,currency,total,created_at,company:companies(id,name),contact:contacts(id,first_name,last_name),kam:profiles(id,full_name)')
      .order('created_at', { ascending: false })
    if (profile?.role === 'kam') q = q.eq('kam_id', profile.id)
    const { data } = await q
    setOrders((data as unknown as OrderRow[]) ?? [])
    setFetching(false)
  }

  const rows     = orders.filter(o => filter === 'all' || o.status === filter)
  const canWrite = profile?.role !== 'reader'

  return (
    <>
      <div className="-m-8 flex flex-col min-h-screen">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-gray-500" />
            <h1 className="text-base font-semibold">Órdenes de Venta</h1>
            <Badge variant="secondary" className="text-xs">{orders.length}</Badge>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => { setSelectedId(null); setDialogOpen(true) }} className="gap-1.5 h-8 text-xs">
              <Plus size={14} /> Nueva Orden
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="px-6 py-2 border-b bg-white flex gap-2 flex-wrap shrink-0">
          {(['all', 'pendiente', 'confirmada', 'entregada', 'cancelada'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn('text-xs px-3 py-1 rounded-full border transition-colors',
                filter === s
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'text-gray-500 border-gray-200 hover:border-gray-400'
              )}>
              {s === 'all' ? 'Todas' : STATUS[s].label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 p-6 overflow-auto">
          {fetching ? (
            <p className="text-sm text-gray-400">Cargando...</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-xs text-gray-400 uppercase tracking-wide">
                  {['#', 'Empresa', 'Contacto', 'Estado', 'Total', 'KAM', 'Fecha'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 font-medium last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">Sin órdenes</td>
                  </tr>
                )}
                {rows.map(o => (
                  <tr key={o.id}
                    onClick={() => { setSelectedId(o.id); setDialogOpen(true) }}
                    className="border-b hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{o.order_number}</td>
                    <td className="py-2.5 pr-4 font-medium">{o.company?.name ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">
                      {o.contact ? `${o.contact.first_name} ${o.contact.last_name}` : '—'}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS[o.status].cls)}>
                        {STATUS[o.status].label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-medium tabular-nums">{fmt(o.total, o.currency)}</td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">{o.kam?.full_name ?? '—'}</td>
                    <td className="py-2.5 text-gray-400 text-xs">
                      {new Date(o.created_at).toLocaleDateString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <SalesOrderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        orderId={selectedId}
        onSaved={() => { load(); setDialogOpen(false) }}
      />
    </>
  )
}