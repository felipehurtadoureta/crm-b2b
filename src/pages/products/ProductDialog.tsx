import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown, ChevronUp, History } from 'lucide-react'
import type { Product, ProductPriceHistory, Currency, ProductType } from '@/types'

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

  useEffect(() => {
    if (product) {
      setForm({
        name:             product.name,
        sku:              product.sku ?? '',
        description:      product.description ?? '',
        type:             product.type === 'inventory' ? 'product' : product.type,
        has_inventory:    false,
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
    }
    setShowHistory(false)
  }, [product, open])

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
      has_inventory:    false,
      service_category: v === 'service' ? f.service_category : '',
    }))
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
        has_inventory:    false,
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
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
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

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <p className="text-sm text-gray-500 pt-1">
            Catálogo comercial para cotizaciones. Las unidades físicas se gestionan en Inventario.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
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

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="Descripción del producto o servicio..."
            />
          </div>

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
