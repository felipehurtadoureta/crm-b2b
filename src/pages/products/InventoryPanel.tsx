import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InventoryCustody, InventoryItem, ProductCurrency } from '@/types'

const STATUS_COLOR: Record<string, string> = {
  disponible: 'bg-green-100 text-green-700',
  reservado:  'bg-yellow-100 text-yellow-700',
  vendido:    'bg-gray-100 text-gray-500',
  dañado:     'bg-red-100 text-red-700',
}

const STATUS_NEEDS_LOCATION = ['vendido', 'reservado']

const CUSTODY_OPTIONS: { value: InventoryCustody; label: string }[] = [
  { value: 'bodega', label: 'Bodega' },
  { value: 'en_cliente', label: 'En cliente' },
  { value: 'prestamo', label: 'Préstamo' },
  { value: 'transito', label: 'Tránsito' },
]

interface ItemWithLocation extends InventoryItem {
  destination_notes?: string
  installed_address?: string
}

interface LocationForm {
  itemId: string
  newStatus: string
  destination_notes: string
  installed_address: string
}

interface Props {
  productId: string
  /** En modal: lista más alta */
  variant?: 'default' | 'dialog'
  /** Tras mutar seriales (p. ej. refrescar totales en el modal padre) */
  onItemsChanged?: () => void
}

export default function InventoryPanel({ productId, variant = 'default', onItemsChanged }: Props) {
  const [items, setItems]               = useState<ItemWithLocation[]>([])
  const [serial, setSerial]             = useState('')
  const [notes, setNotes]               = useState('')
  const [custodyNew, setCustodyNew]     = useState<InventoryCustody>('bodega')
  const [refPrice, setRefPrice]         = useState('')
  const [refCurrency, setRefCurrency]   = useState<ProductCurrency>('CLP')
  const [loading, setLoading]           = useState(false)
  const [addError, setAddError]         = useState<string | null>(null)
  const [locationForm, setLocationForm] = useState<LocationForm | null>(null)

  async function load() {
    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
    setItems(data ?? [])
  }

  useEffect(() => { load() }, [productId])

  async function add() {
    if (!serial.trim()) return
    setLoading(true)
    setAddError(null)
    const parsedRef = parseFloat(refPrice.replace(',', '.'))
    const payload: Record<string, unknown> = {
      product_id:    productId,
      serial_number: serial.trim(),
      status:        'disponible',
      custody:       custodyNew,
      notes:         notes.trim() || null,
    }
    if (!Number.isNaN(parsedRef) && parsedRef >= 0) {
      payload.reference_price = parsedRef
      payload.reference_currency = refCurrency
    }
    const { error } = await supabase.from('inventory_items').insert(payload)
    if (error) {
      const msg = error.message ?? ''
      setAddError(
        msg.includes('duplicate') || msg.includes('unique')
          ? 'Ese número de serie ya existe para este producto.'
          : msg || 'No se pudo agregar la unidad.',
      )
      setLoading(false)
      return
    }
    setSerial('')
    setNotes('')
    setCustodyNew('bodega')
    setRefPrice('')
    setRefCurrency('CLP')
    await load()
    onItemsChanged?.()
    setLoading(false)
  }

  async function updateCustodyRow(id: string, value: string) {
    await supabase.from('inventory_items').update({ custody: value }).eq('id', id)
    await load()
    onItemsChanged?.()
  }

  function handleStatusChange(item: ItemWithLocation, newStatus: string) {
    if (STATUS_NEEDS_LOCATION.includes(newStatus)) {
      setLocationForm({
        itemId:            item.id,
        newStatus,
        destination_notes: item.destination_notes ?? '',
        installed_address: item.installed_address ?? '',
      })
    } else {
      applyStatus(item.id, newStatus, null, null)
    }
  }

  async function applyStatus(
    id: string,
    status: string,
    destination_notes: string | null,
    installed_address: string | null
  ) {
    await supabase.from('inventory_items').update({
      status,
      destination_notes,
      installed_address,
    }).eq('id', id)
    setLocationForm(null)
    await load()
    onItemsChanged?.()
  }

  async function confirmLocation() {
    if (!locationForm) return
    await applyStatus(
      locationForm.itemId,
      locationForm.newStatus,
      locationForm.destination_notes || null,
      locationForm.installed_address || null,
    )
  }

  async function remove(id: string) {
    if (!window.confirm('¿Eliminar esta unidad del inventario?')) return
    await supabase.from('inventory_items').delete().eq('id', id)
    await load()
    onItemsChanged?.()
  }

  const disponibles = items.filter(i => i.status === 'disponible').length
  const listMaxH = variant === 'dialog' ? 'max-h-[min(50vh,20rem)]' : 'max-h-56'

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between text-sm font-medium text-gray-700">
        <span>Inventario de seriales</span>
        <span className="text-xs text-gray-500">{disponibles} disponibles / {items.length} total</span>
      </div>

      {/* Agregar serial */}
      <div className="px-4 py-3 border-b bg-white space-y-2">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="N° de serie"
            value={serial}
            onChange={e => setSerial(e.target.value)}
            className="h-8 text-sm flex-1 min-w-[120px]"
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <Input
            placeholder="Notas (opcional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="h-8 text-sm flex-1 min-w-[140px]"
          />
          <select
            value={custodyNew}
            onChange={e => setCustodyNew(e.target.value as InventoryCustody)}
            className="h-8 text-xs rounded-md border border-gray-200 px-2 bg-white shrink-0"
          >
            {CUSTODY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => void add()} disabled={loading || !serial.trim()} className="h-8 gap-1 shrink-0">
            <Plus size={13} /> Agregar
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="shrink-0">Valor referencia (opcional):</span>
          <Input
            type="number"
            min={0}
            step="any"
            placeholder="Ej: 150000"
            value={refPrice}
            onChange={e => setRefPrice(e.target.value)}
            className="h-8 text-sm w-28"
          />
          <select
            value={refCurrency}
            onChange={e => setRefCurrency(e.target.value as ProductCurrency)}
            className="h-8 text-xs rounded-md border border-gray-200 px-2 bg-white"
          >
            <option value="CLP">CLP</option>
            <option value="USD">USD</option>
            <option value="UF">UF</option>
          </select>
        </div>
        {addError && <p className="text-xs text-red-600">{addError}</p>}
      </div>

      {/* Lista */}
      <div className={cn('divide-y overflow-y-auto', listMaxH)}>
        {items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">Sin seriales registrados</p>
        ) : items.map(item => (
          <div key={item.id} className="px-4 py-2.5 space-y-1 hover:bg-gray-50">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-medium flex-1 min-w-[100px]">{item.serial_number}</span>
              {item.notes && (
                <span className="text-gray-400 text-xs truncate max-w-[120px]">{item.notes}</span>
              )}
              <select
                value={(item.custody as string) ?? 'bodega'}
                onChange={e => void updateCustodyRow(item.id, e.target.value)}
                disabled={item.status === 'vendido'}
                className="text-xs rounded-md border border-gray-200 px-2 py-1 bg-white shrink-0"
              >
                {CUSTODY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={item.status}
                onChange={e => handleStatusChange(item, e.target.value)}
                disabled={item.status === 'vendido'}
                className={`text-xs rounded-full px-2 py-0.5 border-0 font-medium cursor-pointer shrink-0 ${STATUS_COLOR[item.status]}`}
              >
                <option value="disponible">Disponible</option>
                <option value="reservado">Reservado</option>
                <option value="dañado">Dañado</option>
                <option value="vendido" disabled>Vendido</option>
              </select>
              {item.status !== 'vendido' && (
                <button
                  type="button"
                  onClick={() => void remove(item.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {item.reference_price != null && (
              <p className="text-xs text-gray-500 pl-0.5">
                Ref.: {item.reference_currency ?? 'CLP'}{' '}
                {typeof item.reference_price === 'number'
                  ? item.reference_price.toLocaleString('es-CL')
                  : item.reference_price}
              </p>
            )}

            {/* Mostrar ubicación si existe */}
            {(item.installed_address || item.destination_notes) && (
              <div className="flex items-start gap-1.5 text-xs text-gray-400 pl-0.5">
                <MapPin size={11} className="mt-0.5 shrink-0" />
                <span>
                  {[item.installed_address, item.destination_notes].filter(Boolean).join(' — ')}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mini formulario de ubicación */}
      {locationForm && (
        <div className="border-t bg-amber-50 p-4 space-y-3">
          <p className="text-xs font-medium text-amber-700">
            {locationForm.newStatus === 'vendido' ? '¿A dónde fue este producto?' : '¿Dónde estará reservado?'} (opcional)
          </p>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Dirección de instalación</Label>
              <Input
                placeholder="Ej: Av. Providencia 1234, Santiago"
                value={locationForm.installed_address}
                onChange={e => setLocationForm(f => f ? { ...f, installed_address: e.target.value } : f)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas de destino</Label>
              <Textarea
                placeholder="Ej: Quedó en comodato, cliente recoge en oficina..."
                value={locationForm.destination_notes}
                onChange={e => setLocationForm(f => f ? { ...f, destination_notes: e.target.value } : f)}
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setLocationForm(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void confirmLocation()}>
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
