import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown, ChevronUp, History, Plus, X } from 'lucide-react'
import type { Product, ProductPriceHistory, Currency, ProductType } from '@/types'
import InventoryPanel from './InventoryPanel'

interface Props {
  open: boolean
  product: Product | null
  onClose: () => void
  onSaved: () => void
}

const EMPTY: Omit<Product, 'id' | 'created_at' | 'updated_at'> = {
  name:             '',
  sku:              '',
  description:      '',
  type:             'product',
  has_inventory:    false,
  service_category: '',
  price:            0,
  currency:         'CLP',
  tax_rate:         19,
  is_active:        true,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ProductDialog({ open, product, onClose, onSaved }: Props) {
  const [form, setForm]               = useState(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [history, setHistory]         = useState<ProductPriceHistory[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [newSerial, setNewSerial]             = useState('')
  const [newSerialNote, setNewSerialNote]     = useState('')
  const [pendingSerials, setPendingSerials]   = useState<{ serial: string; notes: string }[]>([])
  /** Totales de inventario para productos con stock propio */
  const [stockCounts, setStockCounts]         = useState<{ total: number; disponibles: number } | null>(null)

  useEffect(() => {
    if (product) {
      setForm({
        name:             product.name,
        sku:              product.sku ?? '',
        description:      product.description ?? '',
        // En UI "Producto" agrupa filas legacy `inventory`
        type:             product.type === 'inventory' ? 'product' : product.type,
        has_inventory:    product.has_inventory ?? false,
        service_category: product.service_category ?? '',
        price:            product.price,
        currency:         product.currency,
        tax_rate:         product.tax_rate,
        is_active:        product.is_active,
      })
      loadHistory(product.id)
    } else {
      setForm(EMPTY)
      setHistory([])
      setPendingSerials([])
    }
    setShowHistory(false)
    setNewSerial('')
    setNewSerialNote('')
    setStockCounts(null)
  }, [product, open])

  const loadStockCounts = useCallback(async (productId: string) => {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('status')
      .eq('product_id', productId)
    if (error) {
      console.error(error)
      setStockCounts(null)
      return
    }
    const rows = data ?? []
    setStockCounts({
      total: rows.length,
      disponibles: rows.filter(r => r.status === 'disponible').length,
    })
  }, [])

  /** Totales de seriales para producto físico con stock propio (o si el usuario activa stock en el formulario) */
  useEffect(() => {
    if (!open || !product?.id) return
    const isPhysical = product.type === 'product' || product.type === 'inventory'
    if (!isPhysical || form.type !== 'product' || !form.has_inventory) {
      setStockCounts(null)
      return
    }
    void loadStockCounts(product.id)
  }, [open, product?.id, product?.type, form.type, form.has_inventory, loadStockCounts])

  async function loadHistory(id: string) {
    const { data } = await supabase
      .from('product_price_history')
      .select('*')
      .eq('product_id', id)
      .order('changed_at', { ascending: false })
      .limit(10)
    setHistory(data ?? [])
  }

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleTypeChange(v: ProductType) {
    setForm(f => ({
      ...f,
      type:             v,
      has_inventory:    v === 'service' ? false : f.has_inventory,
      service_category: v === 'service' ? f.service_category : '',
    }))
    if (v !== 'product') setPendingSerials([])
  }

  function addPendingSerial() {
    if (!newSerial.trim()) return
    setPendingSerials(s => [...s, { serial: newSerial.trim(), notes: newSerialNote.trim() }])
    setNewSerial('')
    setNewSerialNote('')
  }

  function removePendingSerial(index: number) {
    setPendingSerials(s => s.filter((_, i) => i !== index))
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)

    try {
      const payload = {
        name:             form.name.trim(),
        sku:              form.sku?.trim()              || null,
        description:      form.description?.trim()      || null,
        type:             form.type,
        has_inventory:    form.has_inventory,
        service_category: form.service_category?.trim() || null,
        price:            form.price,
        currency:         form.currency,
        tax_rate:         form.tax_rate,
        is_active:        form.is_active,
      }

      if (product) {
        const { error } = await supabase
          .from('products')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', product.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error

        if (data && pendingSerials.length > 0) {
          const { error: serialError } = await supabase.from('inventory_items').insert(
            pendingSerials.map(s => ({
              product_id:    data.id,
              serial_number: s.serial,
              status:        'disponible',
              custody:       'bodega',
              notes:         s.notes || null,
            }))
          )
          if (serialError) throw serialError
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      console.error('Error guardando producto:', err)
      alert(`Error: ${JSON.stringify(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const isProduct     = form.type === 'product'
  const showInventory = Boolean(product && isProduct && form.has_inventory)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          {product && stockCounts !== null && form.type === 'product' && form.has_inventory && (
            <p className="text-sm text-gray-600 pt-1">
              Stock total:{' '}
              <span className="font-semibold text-gray-900 tabular-nums">{stockCounts.total}</span>
              <span className="text-gray-500"> ({stockCounts.disponibles} disponibles)</span>
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">

          {/* Nombre + SKU */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Nombre del producto"
              />
            </div>
            <div className="space-y-1.5">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                onChange={e => set('sku', e.target.value)}
                placeholder="SKU-001"
              />
            </div>
          </div>

          {/* Tipo + Inventario / Categoría */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => handleTypeChange(v as ProductType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Producto</SelectItem>
                  <SelectItem value="service">Servicio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isProduct && (
              <div className="space-y-1.5">
                <Label>Gestión de stock</Label>
                <div className="flex items-center gap-4 h-9">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      checked={!form.has_inventory}
                      onChange={() => { set('has_inventory', false); setPendingSerials([]) }}
                    />
                    Compra externa
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      checked={form.has_inventory}
                      onChange={() => set('has_inventory', true)}
                    />
                    Stock propio
                  </label>
                </div>
              </div>
            )}

            {form.type === 'service' && (
              <div className="space-y-1.5">
                <Label>Categoría de servicio</Label>
                <Input
                  value={form.service_category ?? ''}
                  onChange={e => set('service_category', e.target.value)}
                  placeholder="Ej: Consultoría, Instalación, Soporte..."
                />
              </div>
            )}
          </div>

          {/* Seriales al crear */}
          {!product && isProduct && form.has_inventory && (
            <div className="border rounded-md overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between text-sm font-medium text-gray-700">
                <span>Seriales</span>
                <span className="text-xs text-gray-500">{pendingSerials.length} agregados</span>
              </div>
              <div className="px-4 py-3 border-b">
                <div className="flex gap-2">
                  <Input
                    placeholder="N° de serie"
                    value={newSerial}
                    onChange={e => setNewSerial(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPendingSerial()}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Notas (opcional)"
                    value={newSerialNote}
                    onChange={e => setNewSerialNote(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" onClick={addPendingSerial} disabled={!newSerial.trim()} className="h-8 gap-1 shrink-0">
                    <Plus size={13} /> Agregar
                  </Button>
                </div>
              </div>
              <div className="divide-y max-h-40 overflow-y-auto">
                {pendingSerials.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">Sin seriales agregados</p>
                ) : pendingSerials.map((s, i) => (
                  <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                    <span className="font-mono font-medium flex-1">{s.serial}</span>
                    {s.notes && <span className="text-gray-400 text-xs">{s.notes}</span>}
                    <span className="text-xs text-green-600 font-medium">Disponible</span>
                    <button onClick={() => removePendingSerial(i)} className="text-gray-300 hover:text-red-400">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Precio + Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Precio *</Label>
              <Input
                type="number"
                value={form.price === 0 ? '' : form.price}
                onChange={e => set('price', parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={form.currency} onValueChange={v => set('currency', v as Currency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">CLP — Peso chileno</SelectItem>
                  <SelectItem value="USD">USD — Dólar</SelectItem>
                  <SelectItem value="UF">UF — Unidad de fomento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="Descripción del producto o servicio..."
            />
          </div>

          {/* Estado */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="is_active" className="cursor-pointer">Producto activo</Label>
          </div>

          {/* Historial de precios */}
          {product && (
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory(h => !h)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <span className="flex items-center gap-2">
                  <History size={14} /> Historial de precios ({history.length})
                </span>
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showHistory && (
                <div className="divide-y text-sm">
                  {history.length === 0 ? (
                    <p className="px-4 py-3 text-gray-400">Sin cambios registrados</p>
                  ) : history.map(h => (
                    <div key={h.id} className="px-4 py-2.5 flex justify-between items-center">
                      <span className="text-gray-500">{formatDate(h.changed_at)}</span>
                      <span>
                        <span className="line-through text-gray-400 mr-2">
                          {h.old_price.toLocaleString('es-CL')} {h.currency}
                        </span>
                        <span className="font-medium text-gray-900">
                          {h.new_price.toLocaleString('es-CL')} {h.new_currency ?? h.currency}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Panel inventario en edición */}
          {showInventory && product ? (
            <InventoryPanel productId={product.id} onItemsChanged={() => void loadStockCounts(product.id)} />
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? 'Guardando...' : product ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}