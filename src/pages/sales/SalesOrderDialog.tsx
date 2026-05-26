/** @deprecated Módulo legacy sin ruta activa; no modifica inventario (ver InventoryPage). */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company, Contact, Profile, Product } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Trash2, Plus } from 'lucide-react'

type Status   = 'pendiente' | 'confirmada' | 'entregada' | 'cancelada'
type Currency = 'CLP' | 'USD'

const NO_CONTACT   = '__none__'
const NO_PRODUCT   = '__none__'
const NO_INVENTORY = '__none__'
const NO_QUOTE     = '__none__'

type InvOption  = { id: string; serial_number: string }
type ProductOpt = Pick<Product, 'id' | 'name' | 'type' | 'price' | 'tax_rate' | 'has_inventory'>
type QuoteOpt   = { id: string; quote_number: string }

type ItemForm = {
  _key:              string
  id?:               string
  product_id:        string
  inventory_item_id: string
  product_name:      string
  serial_number:     string
  quantity:          number
  unit_price:        number
  tax_rate:          number
  discount_pct:      number
  _inv_options:      InvOption[]
  _is_inventory:     boolean
}

const freshItem = (): ItemForm => ({
  _key:              Math.random().toString(36).slice(2),
  product_id:        NO_PRODUCT,
  inventory_item_id: NO_INVENTORY,
  product_name:      '',
  serial_number:     '',
  quantity:          1,
  unit_price:        0,
  tax_rate:          19,
  discount_pct:      0,
  _inv_options:      [],
  _is_inventory:     false,
})

const lineCalc = (i: ItemForm) => {
  const sub = i.unit_price * i.quantity * (1 - i.discount_pct / 100)
  const tax = sub * (i.tax_rate / 100)
  return { sub, tax, total: sub + tax }
}

const fmt = (v: number, cur: string) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)

interface Props {
  open:    boolean
  onClose: () => void
  orderId: string | null
  onSaved: () => void
}

export default function SalesOrderDialog({ open, onClose, orderId, onSaved }: Props) {
  const { profile } = useAuth()

  // Combos
  const [companies, setCompanies] = useState<Pick<Company, 'id' | 'name'>[]>([])
  const [contacts,  setContacts]  = useState<Pick<Contact, 'id' | 'first_name' | 'last_name'>[]>([])
  const [kams,      setKams]      = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [products,  setProducts]  = useState<ProductOpt[]>([])
  const [quotes,    setQuotes]    = useState<QuoteOpt[]>([])

  // Header state
  const [selectedQuote, setSelectedQuote] = useState(NO_QUOTE)
  const [companyId,     setCompanyId]     = useState('')
  const [contactId,     setContactId]     = useState(NO_CONTACT)
  const [kamId,         setKamId]         = useState('')
  const [currency,      setCurrency]      = useState<Currency>('CLP')
  const [notes,         setNotes]         = useState('')
  const [status,        setStatus]        = useState<Status>('pendiente')
  const [prevStatus,    setPrevStatus]    = useState<Status>('pendiente')
  const [quoteId,       setQuoteId]       = useState<string | null>(null)

  // Items
  const [items,  setItems]  = useState<ItemForm[]>([freshItem()])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const readonly     = profile?.role === 'reader'
  const isSuperAdmin = profile?.role === 'super_admin'

  // ── Combos ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    supabase.from('companies').select('id,name').eq('status', 'activo').order('name')
      .then(({ data }) => setCompanies(data ?? []))
    supabase.from('profiles').select('id,full_name').eq('is_active', true)
      .then(({ data }) => setKams(data ?? []))
    supabase.from('products').select('id,name,type,price,tax_rate').eq('is_active', true).order('name')
      .then(({ data }) => setProducts((data as ProductOpt[]) ?? []))
    if (!orderId) {
      supabase.from('quotes').select('id,quote_number').eq('status', 'aceptada')
        .order('created_at', { ascending: false })
        .then(({ data }) => setQuotes(data ?? []))
    }
  }, [open])

  // ── Contacts by company ────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) { setContacts([]); return }
    supabase.from('contacts').select('id,first_name,last_name')
      .eq('company_id', companyId).eq('is_active', true).order('first_name')
      .then(({ data }) => setContacts(data ?? []))
  }, [companyId])

  // ── Load order when editing ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setError('')

    if (orderId) {
      Promise.all([
        supabase.from('sales_orders').select('*').eq('id', orderId).single(),
        supabase.from('sales_order_items').select('*').eq('sales_order_id', orderId),
      ]).then(async ([{ data: order }, { data: rawItems }]) => {
        if (!order) return
        setCompanyId(order.company_id)
        setContactId(order.contact_id ?? NO_CONTACT)
        setKamId(order.kam_id)
        setCurrency(order.currency)
        setNotes(order.notes ?? '')
        setStatus(order.status)
        setPrevStatus(order.status)
        setQuoteId(order.quote_id ?? null)
        setSelectedQuote(NO_QUOTE)

        const mapped: ItemForm[] = await Promise.all(
          (rawItems ?? []).map(async (i: any) => {
            let invOptions: InvOption[] = []
            const hasInv = !!i.inventory_item_id

            if (i.product_id && hasInv) {
              const { data } = await supabase
                .from('inventory_items')
                .select('id,serial_number')
                .eq('product_id', i.product_id)
                .or(`status.eq.disponible,id.eq.${i.inventory_item_id}`)
              invOptions = data ?? []
            }

            return {
              _key:              Math.random().toString(36).slice(2),
              id:                i.id,
              product_id:        i.product_id        ?? NO_PRODUCT,
              inventory_item_id: i.inventory_item_id ?? NO_INVENTORY,
              product_name:      i.product_name,
              serial_number:     i.serial_number ?? '',
              quantity:          Number(i.quantity),
              unit_price:        Number(i.unit_price),
              tax_rate:          Number(i.tax_rate),
              discount_pct:      Number(i.discount_pct),
              _inv_options:      invOptions,
              _is_inventory:     hasInv,
            }
          })
        )
        setItems(mapped.length ? mapped : [freshItem()])
      })
    } else {
      setCompanyId('')
      setContactId(NO_CONTACT)
      setKamId(profile?.id ?? '')
      setCurrency('CLP')
      setNotes('')
      setStatus('pendiente')
      setPrevStatus('pendiente')
      setQuoteId(null)
      setSelectedQuote(NO_QUOTE)
      setItems([freshItem()])
    }
  }, [open, orderId]) // eslint-disable-line

  // ── Load from quote ────────────────────────────────────────────────────────
  const handleQuoteSelect = async (qId: string) => {
    setSelectedQuote(qId)
    if (qId === NO_QUOTE) return

    const [{ data: quote }, { data: qItems }] = await Promise.all([
      supabase.from('quotes').select('*').eq('id', qId).single(),
      supabase.from('quote_items').select('*').eq('quote_id', qId),
    ])
    if (!quote) return

    setCompanyId(quote.company_id)
    setContactId(quote.contact_id ?? NO_CONTACT)
    setKamId(quote.kam_id)
    setCurrency(quote.currency)
    setQuoteId(qId)

    if (qItems?.length) {
      setItems(qItems.map((qi: any) => ({
        _key:              Math.random().toString(36).slice(2),
        product_id:        qi.product_id ?? NO_PRODUCT,
        inventory_item_id: NO_INVENTORY,
        product_name:      qi.product_name ?? qi.description ?? '',
        serial_number:     '',
        quantity:          Number(qi.quantity ?? 1),
        unit_price:        Number(qi.unit_price ?? 0),
        tax_rate:          Number(qi.tax_rate ?? 19),
        discount_pct:      Number(qi.discount_pct ?? 0),
        _inv_options:      [],
        _is_inventory:     false,
      })))
    }
  }

  // ── Item helpers ───────────────────────────────────────────────────────────
  const updateItem = (key: string, patch: Partial<ItemForm>) =>
    setItems(prev => prev.map(i => i._key === key ? { ...i, ...patch } : i))

  const handleProductChange = async (key: string, pid: string) => {
    if (pid === NO_PRODUCT) {
      updateItem(key, {
        product_id: NO_PRODUCT, product_name: '', unit_price: 0, tax_rate: 19,
        _is_inventory: false, _inv_options: [], inventory_item_id: NO_INVENTORY, serial_number: '',
      })
      return
    }
    const p = products.find(x => x.id === pid)
    if (!p) return

    const patch: Partial<ItemForm> = {
      product_id:        pid,
      product_name:      p.name,
      unit_price:        Number(p.price),
      tax_rate:          Number(p.tax_rate),
      _is_inventory:     p.type === 'inventory' || (p.type === 'product' && (p.has_inventory ?? false)),
      inventory_item_id: NO_INVENTORY,
      serial_number:     '',
    }

    const loadSerials = p.type === 'inventory' || (p.type === 'product' && (p.has_inventory ?? false))
    if (loadSerials) {
      const { data } = await supabase
        .from('inventory_items').select('id,serial_number')
        .eq('product_id', pid).eq('status', 'disponible')
      patch._inv_options = data ?? []
    } else {
      patch._inv_options = []
    }

    updateItem(key, patch)
  }

  const handleInvChange = (key: string, invId: string) => {
    const inv = items.find(i => i._key === key)?._inv_options.find(x => x.id === invId)
    updateItem(key, { inventory_item_id: invId, serial_number: inv?.serial_number ?? '' })
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = items.reduce(
    (acc, i) => {
      const { sub, tax, total } = lineCalc(i)
      return { sub: acc.sub + sub, tax: acc.tax + tax, total: acc.total + total }
    },
    { sub: 0, tax: 0, total: 0 }
  )

  // ── Order number ───────────────────────────────────────────────────────────
  const genOrderNumber = async () => {
    const now  = new Date()
    const y    = now.getFullYear()
    const m    = String(now.getMonth() + 1).padStart(2, '0')
    const { count } = await supabase
      .from('sales_orders').select('*', { count: 'exact', head: true })
      .gte('created_at', `${y}-${m}-01`)
    return `OV-${y}${m}-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!companyId)                              { setError('Selecciona una empresa'); return }
    if (!kamId)                                  { setError('Selecciona un KAM'); return }
    if (items.some(i => !i.product_name.trim())) { setError('Todos los ítems necesitan nombre'); return }
    setSaving(true); setError('')

    try {
      // Guardar IDs de inventario previos (para revertir si se cancela)
      let oldInvIds: string[] = []
      if (orderId) {
        const { data } = await supabase
          .from('sales_order_items').select('inventory_item_id')
          .eq('sales_order_id', orderId).not('inventory_item_id', 'is', null)
        oldInvIds = (data ?? []).map((x: any) => x.inventory_item_id).filter(Boolean)
      }

      const now = new Date().toISOString()
      const orderPayload: Record<string, any> = {
        company_id:  companyId,
        contact_id:  contactId === NO_CONTACT ? null : contactId,
        kam_id:      kamId,
        currency,
        notes:       notes.trim() || null,
        status,
        quote_id:    quoteId,
        subtotal:    Math.round(totals.sub   * 100) / 100,
        tax_amount:  Math.round(totals.tax   * 100) / 100,
        total:       Math.round(totals.total * 100) / 100,
      }

      if (status === 'confirmada' && prevStatus !== 'confirmada') orderPayload.confirmed_at = now
      if (status === 'entregada'  && prevStatus !== 'entregada')  orderPayload.delivered_at = now

      let oid = orderId

      if (orderId) {
        const { error } = await supabase.from('sales_orders').update(orderPayload).eq('id', orderId)
        if (error) throw error
        await supabase.from('sales_order_items').delete().eq('sales_order_id', orderId)
      } else {
        orderPayload.order_number = await genOrderNumber()
        if (status === 'confirmada') orderPayload.confirmed_at = now
        const { data, error } = await supabase
          .from('sales_orders').insert(orderPayload).select('id').single()
        if (error) throw error
        oid = data.id
      }

      // Insertar ítems
      const itemPayloads = items.map(item => {
        const { sub, tax, total } = lineCalc(item)
        return {
          sales_order_id:    oid,
          product_id:        item.product_id        === NO_PRODUCT   ? null : item.product_id,
          inventory_item_id: item.inventory_item_id === NO_INVENTORY ? null : item.inventory_item_id,
          product_name:      item.product_name.trim(),
          serial_number:     item.serial_number.trim() || null,
          quantity:          item.quantity,
          unit_price:        item.unit_price,
          tax_rate:          item.tax_rate,
          discount_pct:      item.discount_pct,
          line_subtotal:     Math.round(sub   * 100) / 100,
          line_tax:          Math.round(tax   * 100) / 100,
          line_total:        Math.round(total * 100) / 100,
        }
      })
      const { error: itemErr } = await supabase.from('sales_order_items').insert(itemPayloads)
      if (itemErr) throw itemErr

      /** Inventario desacoplado: las salidas se registran en el módulo Inventario. */

      onSaved()
    } catch (e: any) {
      setError(e.message ?? 'Error inesperado')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 flex flex-col"
           style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {orderId ? 'Editar Orden de Venta' : 'Nueva Orden de Venta'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Cargar desde cotización */}
          {!orderId && (
            <div className="space-y-1">
              <Label>Cargar desde cotización aceptada <span className="text-gray-400 font-normal">(opcional)</span></Label>
              <Select value={selectedQuote} onValueChange={handleQuoteSelect}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cotización..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_QUOTE}>— Sin cotización —</SelectItem>
                  {quotes.map(q => <SelectItem key={q.id} value={q.id}>{q.quote_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Empresa *</Label>
              <Select value={companyId} onValueChange={v => { setCompanyId(v); setContactId(NO_CONTACT) }} disabled={readonly}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Contacto</Label>
              <Select value={contactId} onValueChange={setContactId} disabled={readonly || !companyId}>
                <SelectTrigger>
                  <SelectValue placeholder={companyId ? 'Seleccionar contacto' : 'Primero elige empresa'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CONTACT}>Sin contacto</SelectItem>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isSuperAdmin && (
              <div className="space-y-1">
                <Label>KAM *</Label>
                <Select value={kamId} onValueChange={setKamId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar KAM" /></SelectTrigger>
                  <SelectContent>
                    {kams.map(k => <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={v => setCurrency(v as Currency)} disabled={readonly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">CLP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {orderId && (
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={status} onValueChange={v => setStatus(v as Status)} disabled={readonly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="confirmada">Confirmada</SelectItem>
                    <SelectItem value="entregada">Entregada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} disabled={readonly} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Ítems</h3>
              {!readonly && (
                <Button size="sm" variant="outline" onClick={() => setItems(p => [...p, freshItem()])}
                  className="gap-1 h-7 text-xs">
                  <Plus size={12} /> Agregar ítem
                </Button>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[720px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500 w-48">Producto / Serie</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 w-14">Cant</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">P. Unit</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 w-14">Dcto%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 w-14">IVA%</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500 w-24">Total</th>
                      {!readonly && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map(item => {
                      const { total } = lineCalc(item)
                      return (
                        <tr key={item._key} className="align-top">
                          {/* Producto + Serie */}
                          <td className="px-2 py-1.5 space-y-1">
                            <Select value={item.product_id} onValueChange={v => handleProductChange(item._key, v)} disabled={readonly}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Seleccionar..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_PRODUCT}>Manual</SelectItem>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {item._is_inventory && (
                              <Select value={item.inventory_item_id} onValueChange={v => handleInvChange(item._key, v)} disabled={readonly}>
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="N° Serie..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_INVENTORY}>Sin asignar</SelectItem>
                                  {item._inv_options.map(inv =>
                                    <SelectItem key={inv.id} value={inv.id}>{inv.serial_number}</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          {/* Nombre */}
                          <td className="px-2 py-1.5">
                            <Input className="h-7 text-xs" value={item.product_name} placeholder="Descripción"
                              onChange={e => updateItem(item._key, { product_name: e.target.value })}
                              disabled={readonly} />
                          </td>
                          {/* Cantidad */}
                          <td className="px-2 py-1.5">
                            <Input className="h-7 text-xs text-right" type="number" min={0.01} step={0.01}
                              value={item.quantity}
                              onChange={e => updateItem(item._key, { quantity: parseFloat(e.target.value) || 1 })}
                              disabled={readonly} />
                          </td>
                          {/* Precio */}
                          <td className="px-2 py-1.5">
                            <Input className="h-7 text-xs text-right" type="number" min={0}
                              value={item.unit_price}
                              onChange={e => updateItem(item._key, { unit_price: parseFloat(e.target.value) || 0 })}
                              disabled={readonly} />
                          </td>
                          {/* Dcto */}
                          <td className="px-2 py-1.5">
                            <Input className="h-7 text-xs text-right" type="number" min={0} max={100}
                              value={item.discount_pct}
                              onChange={e => updateItem(item._key, { discount_pct: parseFloat(e.target.value) || 0 })}
                              disabled={readonly} />
                          </td>
                          {/* IVA */}
                          <td className="px-2 py-1.5">
                            <Input className="h-7 text-xs text-right" type="number" min={0} max={100}
                              value={item.tax_rate}
                              onChange={e => updateItem(item._key, { tax_rate: parseFloat(e.target.value) || 0 })}
                              disabled={readonly} />
                          </td>
                          {/* Total */}
                          <td className="px-3 py-1.5 text-right font-medium text-gray-700 tabular-nums pt-3">
                            {fmt(total, currency)}
                          </td>
                          {/* Eliminar */}
                          {!readonly && (
                            <td className="px-1 py-1.5 text-center pt-3">
                              <button onClick={() => setItems(p => p.filter(i => i._key !== item._key))}
                                className="text-gray-300 hover:text-red-400 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totales */}
            <div className="mt-3 flex justify-end">
              <div className="w-52 space-y-1 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal (neto)</span>
                  <span className="tabular-nums">{fmt(totals.sub, currency)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>IVA</span>
                  <span className="tabular-nums">{fmt(totals.tax, currency)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 border-t pt-1">
                  <span>Total</span>
                  <span className="tabular-nums">{fmt(totals.total, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-2 shrink-0">
          {/* Estado al crear */}
          {!orderId && !readonly && (
            <div className="mr-auto">
              <Select value={status} onValueChange={v => setStatus(v as Status)}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="confirmada">Confirmada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {!readonly && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : orderId ? 'Guardar cambios' : 'Crear orden'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}