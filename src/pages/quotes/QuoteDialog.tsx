import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Company, Contact, Profile, Product, Quote } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button }    from '@/components/ui/button'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Textarea }  from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, RefreshCw, PackageSearch, Printer } from 'lucide-react'
import QuotePrintView from './QuotePrintView'

type Currency     = 'CLP' | 'USD' | 'UF'
type DiscountType = 'none' | 'percent' | 'fixed'

interface LineItem {
  tempId:           string
  id?:              string
  is_free:          boolean
  product_id:       string
  product_name:     string
  product_currency: string
  original_price:   number
  unit_price:       number
  quantity:         number
  subtotal:         number
}

interface DealOption {
  id:    string
  title: string
  stage: string
}

interface Props {
  open:              boolean
  onClose:           () => void
  quote:             Quote | null
  companies:         Company[]
  contacts:          Contact[]
  kams:              Profile[]
  products:          Product[]
  initialDealId?:    string
  initialCompanyId?: string
  initialCallId?:    string
  onSaved:           () => void
}

type FormState = {
  company_id:         string
  contact_id:         string
  kam_id:             string
  deal_id:            string
  call_id:            string
  currency:           Currency
  usd_clp_rate:       string
  uf_clp_rate:        string
  exchange_rate_date: string
  status:             string
  close_probability:  number
  valid_until:        string
  notes:              string
  is_tax_exempt:      boolean
  discount_type:      DiscountType
  discount_value:     number
}

const TAX_RATE = 0.19
const SYMBOL: Record<Currency, string> = { CLP: '$', USD: 'US$', UF: 'UF' }
const mkTempId = () => Math.random().toString(36).slice(2)
const today    = () => new Date().toISOString().slice(0, 10)

const emptyForm = (kamId: string): FormState => ({
  company_id: '', contact_id: '', kam_id: kamId, deal_id: '', call_id: '',
  currency: 'CLP', usd_clp_rate: '', uf_clp_rate: '', exchange_rate_date: today(),
  status: 'borrador', close_probability: 50,
  valid_until: '', notes: '',
  is_tax_exempt: false, discount_type: 'none', discount_value: 0,
})

const fmtNum = (n: number, cur: Currency | string): string => {
  if (cur === 'CLP') return new Intl.NumberFormat('es-CL').format(Math.round(n))
  if (cur === 'USD') return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL').format(Math.round(n))

const round = (n: number, cur: Currency): number =>
  cur === 'CLP' ? Math.round(n) :
  cur === 'UF'  ? parseFloat(n.toFixed(4)) :
                  parseFloat(n.toFixed(2))

const toCLP = (price: number, fromCur: string, usdRate: number, ufRate: number): number => {
  if (fromCur === 'USD') return price * (usdRate || 1)
  if (fromCur === 'UF')  return price * (ufRate  || 1)
  return price
}

const fromCLP = (clp: number, toCur: Currency, usdRate: number, ufRate: number): number => {
  if (toCur === 'USD') return clp / (usdRate || 1)
  if (toCur === 'UF')  return clp / (ufRate  || 1)
  return clp
}

const convertToQuote = (price: number, fromCur: string, toCur: Currency, usdRate: number, ufRate: number): number => {
  if (fromCur === toCur) return price
  return fromCLP(toCLP(price, fromCur, usdRate, ufRate), toCur, usdRate, ufRate)
}

const symOf = (cur: string): string =>
  cur === 'CLP' ? '$' : cur === 'USD' ? 'US$' : cur === 'UF' ? 'UF' : cur

export default function QuoteDialog({
  open, onClose, quote, companies, contacts, kams, products,
  initialDealId, initialCompanyId, initialCallId, onSaved,
}: Props) {
  const { profile } = useAuth()
  const [form, setForm]         = useState<FormState>(emptyForm(''))
  const [items, setItems]       = useState<LineItem[]>([])
  const [deals, setDeals]       = useState<DealOption[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  const filteredContacts = contacts.filter(c => c.company_id === form.company_id)
  const cur     = form.currency
  const sym     = SYMBOL[cur]
  const usdRate = parseFloat(form.usd_clp_rate) || 0
  const ufRate  = parseFloat(form.uf_clp_rate)  || 0

  const itemCurrencies     = new Set(items.map(i => i.product_currency).filter(Boolean))
  const needsUsdRate       = cur === 'USD' || itemCurrencies.has('USD')
  const needsUfRate        = cur === 'UF'  || itemCurrencies.has('UF')
  const showRateSection    = needsUsdRate || needsUfRate
  const hasMixedCurrencies = items.some(i => i.product_currency && i.product_currency !== cur && !i.is_free)

  const itemsSubtotal  = items.reduce((s, i) => s + i.subtotal, 0)
  const discountAmount =
    form.discount_type === 'percent' ? itemsSubtotal * (form.discount_value / 100) :
    form.discount_type === 'fixed'   ? Math.min(form.discount_value, itemsSubtotal) : 0
  const netSubtotal = Math.max(0, itemsSubtotal - discountAmount)
  const taxAmount   = form.is_tax_exempt ? 0 : netSubtotal * TAX_RATE
  const total       = netSubtotal + taxAmount
  const totalCLPRef = cur !== 'CLP' ? toCLP(total, cur, usdRate, ufRate) : null
  const showCLPRef  = totalCLPRef !== null && totalCLPRef > 0 &&
    ((cur === 'USD' && usdRate > 0) || (cur === 'UF' && ufRate > 0))

  useEffect(() => {
    if (!open) return
    setError(null)
    setShowPrint(false)

    if (quote) {
      const q = quote as any
      setForm({
        company_id:         q.company_id,
        contact_id:         q.contact_id            ?? '',
        kam_id:             q.kam_id,
        deal_id:            q.deal_id               ?? '',
        call_id:            q.call_id               ?? '',
        currency:           (q.currency as Currency) ?? 'CLP',
        usd_clp_rate:       q.usd_clp_rate  != null ? String(q.usd_clp_rate)
                          : q.exchange_rate != null ? String(q.exchange_rate) : '',
        uf_clp_rate:        q.uf_clp_rate   != null ? String(q.uf_clp_rate) : '',
        exchange_rate_date: q.exchange_rate_date ?? today(),
        status:             q.status,
        close_probability:  q.close_probability,
        valid_until:        q.valid_until   ?? '',
        notes:              q.notes         ?? '',
        is_tax_exempt:      q.is_tax_exempt ?? false,
        discount_type:      (q.discount_type ?? 'none') as DiscountType,
        discount_value:     q.discount_value ?? 0,
      })
      supabase
        .from('quote_items')
        .select('id, product_id, product_name, product_currency, quantity, unit_price, subtotal, product:products(price, currency)')
        .eq('quote_id', quote.id)
        .then(({ data, error: err }) => {
          if (err) { console.error('Error cargando ítems:', err); setItems([]); return }
          setItems((data ?? []).map(i => ({
            tempId:           mkTempId(),
            id:               i.id,
            is_free:          !i.product_id,
            product_id:       i.product_id        ?? '',
            product_name:     i.product_name      ?? '',
            product_currency: i.product_currency  ?? (i as any).product?.currency ?? '',
            original_price:   (i as any).product?.price ?? Number(i.unit_price),
            unit_price:       Number(i.unit_price),
            quantity:         Number(i.quantity),
            subtotal:         Number(i.subtotal),
          })))
        })
    } else {
      setForm({
        ...emptyForm(profile?.id ?? ''),
        deal_id:    initialDealId    ?? '',
        company_id: initialCompanyId ?? '',
        call_id:    initialCallId    ?? '',
      })
      setItems([])
    }
  }, [open, quote?.id]) // eslint-disable-line

  useEffect(() => {
    if (!form.company_id) { setDeals([]); return }
    supabase
      .from('deals').select('id, title, stage')
      .eq('company_id', form.company_id)
      .not('stage', 'in', '("ganado","perdido")')
      .order('created_at', { ascending: false })
      .then(({ data }) => setDeals(data ?? []))
  }, [form.company_id])

  const set = (field: keyof FormState, value: string | number | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleCompanyChange = async (companyId: string) => {
    setForm(prev => ({ ...prev, company_id: companyId, contact_id: '', deal_id: '' }))
    if (profile?.role !== 'kam') {
      const { data } = await supabase
        .from('company_kams').select('kam_id')
        .eq('company_id', companyId).eq('is_lead', true).single()
      if (data?.kam_id)
        setForm(prev => ({ ...prev, company_id: companyId, contact_id: '', deal_id: '', kam_id: data.kam_id }))
    }
  }

  const addCatalogItem = () =>
    setItems(prev => [...prev, {
      tempId: mkTempId(), is_free: false,
      product_id: '', product_name: '', product_currency: '',
      original_price: 0, unit_price: 0, quantity: 1, subtotal: 0,
    }])

  const addFreeItem = () =>
    setItems(prev => [...prev, {
      tempId: mkTempId(), is_free: true,
      product_id: '', product_name: '', product_currency: cur,
      original_price: 0, unit_price: 0, quantity: 1, subtotal: 0,
    }])

  const removeItem = (tempId: string) =>
    setItems(prev => prev.filter(i => i.tempId !== tempId))

  const updateProduct = (tempId: string, productId: string) => {
    const p = products.find(x => x.id === productId)
    if (!p) return
    const converted = convertToQuote(p.price, p.currency, cur, usdRate, ufRate)
    setItems(prev => prev.map(i =>
      i.tempId !== tempId ? i : {
        ...i,
        product_id:       p.id,
        product_name:     p.name,
        product_currency: p.currency,
        original_price:   p.price,
        unit_price:       converted,
        subtotal:         converted * i.quantity,
      }
    ))
  }

  const updateFreeName = (tempId: string, name: string) =>
    setItems(prev => prev.map(i => i.tempId !== tempId ? i : { ...i, product_name: name }))

  const updateFreeCurrency = (tempId: string, newCur: string) =>
    setItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i
      const converted = convertToQuote(i.original_price, newCur, cur, usdRate, ufRate)
      return { ...i, product_currency: newCur, unit_price: converted, subtotal: converted * i.quantity }
    }))

  const updateQty = (tempId: string, qty: number) =>
    setItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i
      const q = Math.max(1, qty)
      return { ...i, quantity: q, subtotal: i.unit_price * q }
    }))

  const updatePrice = (tempId: string, price: number) =>
    setItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i
      const p = Math.max(0, price)
      if (i.is_free) {
        const converted = convertToQuote(p, i.product_currency, cur, usdRate, ufRate)
        return { ...i, original_price: p, unit_price: converted, subtotal: converted * i.quantity }
      }
      return { ...i, unit_price: p, subtotal: p * i.quantity }
    }))

  const recalcItems = () => {
    setItems(prev => prev.map(i => {
      if (!i.product_currency) return i
      const converted = convertToQuote(i.original_price, i.product_currency, cur, usdRate, ufRate)
      return { ...i, unit_price: converted, subtotal: converted * i.quantity }
    }))
  }

  const handleSave = async () => {
    if (!form.company_id)               { setError('Selecciona una empresa'); return }
    if (!form.kam_id)                   { setError('Selecciona un KAM'); return }
    if (needsUsdRate && !usdRate)       { setError('Ingresa el tipo de cambio USD → CLP'); return }
    if (needsUfRate  && !ufRate)        { setError('Ingresa el tipo de cambio UF → CLP'); return }
    if (items.length === 0)             { setError('Agrega al menos un ítem'); return }
    if (items.some(i => !i.is_free && !i.product_id)) {
      setError('Todos los ítems de catálogo deben tener un producto seleccionado'); return
    }
    if (items.some(i => i.is_free && !i.product_name.trim())) {
      setError('Los ítems libres deben tener una descripción'); return
    }

    setLoading(true)
    setError(null)

    try {
      let quoteNumber = quote?.quote_number
      if (!quote) {
        const { count } = await supabase.from('quotes').select('id', { count: 'exact', head: true })
        const year = new Date().getFullYear()
        quoteNumber = `COT-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
      }

      const payload: Record<string, unknown> = {
        company_id:         form.company_id,
        contact_id:         form.contact_id || null,
        kam_id:             form.kam_id,
        deal_id:            form.deal_id    || null,
        call_id:            form.call_id    || null,
        currency:           cur,
        usd_clp_rate:       usdRate > 0 ? usdRate : null,
        uf_clp_rate:        ufRate  > 0 ? ufRate  : null,
        exchange_rate_date: (needsUsdRate || needsUfRate) ? form.exchange_rate_date || null : null,
        status:             form.status,
        close_probability:  form.close_probability,
        valid_until:        form.valid_until || null,
        notes:              form.notes       || null,
        is_tax_exempt:      form.is_tax_exempt,
        discount_type:      form.discount_type !== 'none' ? form.discount_type : null,
        discount_value:     form.discount_type !== 'none' ? form.discount_value : 0,
        discount_amount:    round(discountAmount, cur),
        subtotal:           round(netSubtotal,    cur),
        tax_amount:         round(taxAmount,      cur),
        total:              round(total,           cur),
      }
      if (!quote) payload.quote_number = quoteNumber

      const { data: saved, error: quoteErr } = quote
        ? await supabase.from('quotes').update(payload).eq('id', quote.id).select().single()
        : await supabase.from('quotes').insert(payload).select().single()

      if (quoteErr) throw quoteErr
      const quoteId: string = saved.id

      const { error: delErr } = await supabase.from('quote_items').delete().eq('quote_id', quoteId)
      if (delErr) throw delErr

      const { error: itemsErr } = await supabase.from('quote_items').insert(
        items.map(i => ({
          quote_id:         quoteId,
          product_id:       i.is_free ? null : i.product_id,
          product_name:     i.product_name,
          product_currency: i.product_currency || null,
          quantity:         i.quantity,
          unit_price:       round(i.unit_price, cur),
          subtotal:         round(i.subtotal,   cur),
        }))
      )
      if (itemsErr) throw itemsErr

      onSaved()
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {quote ? `Editar ${quote.quote_number}` : 'Nueva cotización'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 gap-4">

              {/* Empresa */}
              <div className="col-span-2 space-y-1">
                <Label>Empresa *</Label>
                <Select
                  value={form.company_id || '__none__'}
                  onValueChange={v => v !== '__none__' && handleCompanyChange(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una empresa" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contacto */}
              <div className="space-y-1">
                <Label>Contacto</Label>
                <Select
                  value={form.contact_id || '__none__'}
                  onValueChange={v => set('contact_id', v === '__none__' ? '' : v)}
                  disabled={!form.company_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.company_id ? 'Opcional' : 'Primero elige empresa'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">— Sin contacto —</SelectItem>
                    {filteredContacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* KAM */}
              <div className="space-y-1">
                <Label>KAM</Label>
                <Select
                  value={form.kam_id || '__none__'}
                  onValueChange={v => set('kam_id', v === '__none__' ? '' : v)}
                  disabled={profile?.role === 'kam'}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona un KAM" /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {kams.map(k => <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {profile?.role === 'kam' && (
                  <p className="text-xs text-gray-400">Asignado automáticamente</p>
                )}
              </div>

              {/* Negocio vinculado */}
              <div className="col-span-2 space-y-1">
                <Label>Negocio vinculado</Label>
                <Select
                  value={form.deal_id || '__none__'}
                  onValueChange={v => set('deal_id', v === '__none__' ? '' : v)}
                  disabled={!form.company_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={form.company_id ? 'Opcional' : 'Primero elige empresa'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">— Sin negocio —</SelectItem>
                    {deals.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.company_id && deals.length === 0 && (
                  <p className="text-xs text-gray-400">No hay negocios activos para esta empresa</p>
                )}
              </div>

              {/* Moneda */}
              <div className="space-y-1">
                <Label>Moneda de la cotización *</Label>
                <Select value={cur} onValueChange={v => set('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLP">$ — Peso chileno (CLP)</SelectItem>
                    <SelectItem value="USD">US$ — Dólar americano</SelectItem>
                    <SelectItem value="UF">UF — Unidad de Fomento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Estado */}
              <div className="space-y-1">
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="borrador">Borrador</SelectItem>
                    <SelectItem value="enviada">Enviada</SelectItem>
                    <SelectItem value="aceptada">Aceptada</SelectItem>
                    <SelectItem value="rechazada">Rechazada</SelectItem>
                    <SelectItem value="orden_de_venta">Orden de Venta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tipos de cambio */}
              {showRateSection && (
                <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-amber-900">Tipos de cambio</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Los precios se convierten a <strong>{sym} ({cur})</strong> usando estos valores.
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <Label className="text-xs text-amber-800">Fecha de referencia</Label>
                      <Input
                        type="date"
                        value={form.exchange_rate_date}
                        onChange={e => set('exchange_rate_date', e.target.value)}
                        className="h-8 text-sm w-40 bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {needsUsdRate && (
                      <div className="space-y-1">
                        <Label className="text-sm font-medium text-amber-900">1 US$ equivale a</Label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                          <Input
                            type="number" min={0} step="0.01" placeholder="Ej: 960"
                            value={form.usd_clp_rate}
                            onChange={e => set('usd_clp_rate', e.target.value)}
                            className="pl-7 bg-white"
                          />
                        </div>
                        {usdRate > 0 && (
                          <p className="text-xs text-amber-700">
                            US$ 1 = $ {fmtCLP(usdRate)} CLP
                            {cur === 'UF' && ufRate > 0 && ` = UF ${fmtNum(usdRate / ufRate, 'UF')}`}
                          </p>
                        )}
                      </div>
                    )}
                    {needsUfRate && (
                      <div className="space-y-1">
                        <Label className="text-sm font-medium text-amber-900">1 UF equivale a</Label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                          <Input
                            type="number" min={0} step="1" placeholder="Ej: 37500"
                            value={form.uf_clp_rate}
                            onChange={e => set('uf_clp_rate', e.target.value)}
                            className="pl-7 bg-white"
                          />
                        </div>
                        {ufRate > 0 && (
                          <p className="text-xs text-amber-700">
                            UF 1 = $ {fmtCLP(ufRate)} CLP
                            {cur === 'USD' && usdRate > 0 && ` = US$ ${fmtNum(ufRate / usdRate, 'USD')}`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {hasMixedCurrencies && (
                    <div className="pt-1 border-t border-amber-200">
                      <Button type="button" size="sm" variant="outline" onClick={recalcItems}
                        className="bg-white text-amber-800 border-amber-300 hover:bg-amber-50">
                        <RefreshCw size={13} className="mr-1.5" />
                        Recalcular precios con estas tasas
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Válido hasta */}
              <div className="space-y-1">
                <Label>Válido hasta</Label>
                <Input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
              </div>

              {/* Probabilidad */}
              <div className="space-y-1">
                <Label>Probabilidad de cierre (%)</Label>
                <Input type="number" min={0} max={100}
                  value={form.close_probability}
                  onChange={e => set('close_probability', parseInt(e.target.value) || 0)} />
              </div>

              {/* Notas */}
              <div className="col-span-2 space-y-1">
                <Label>Notas</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Observaciones de la cotización..." rows={2} />
              </div>
            </div>

            <Separator />

            {/* Ítems */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">Ítems</h3>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                    Precios en {sym} · {cur}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={addFreeItem}>
                    <PackageSearch size={14} className="mr-1" /> Ítem libre
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={addCatalogItem}>
                    <Plus size={14} className="mr-1" /> Del catálogo
                  </Button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                  No hay ítems. Agrega desde el catálogo o crea un ítem libre.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Producto / Descripción</th>
                        <th className="w-24 px-3 py-2 text-center font-medium text-gray-600">Cant.</th>
                        <th className="w-44 px-3 py-2 text-right font-medium text-gray-600">Precio original</th>
                        <th className="w-36 px-3 py-2 text-right font-medium text-gray-600">Subtotal ({sym})</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map(item => {
                        const isDifferentCurrency = !item.is_free && item.product_currency && item.product_currency !== cur
                        return (
                          <tr key={item.tempId}
                            className={item.is_free ? 'bg-blue-50/40 hover:bg-blue-50/60' : 'hover:bg-gray-50/60'}>
                            <td className="px-3 py-2">
                              {item.is_free ? (
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                                    Libre
                                  </span>
                                  <Input value={item.product_name}
                                    onChange={e => updateFreeName(item.tempId, e.target.value)}
                                    placeholder="Descripción del ítem..."
                                    className="h-8 text-sm flex-1" />
                                </div>
                              ) : (
                                <Select
                                  value={item.product_id || '__none__'}
                                  onValueChange={v => v !== '__none__' && updateProduct(item.tempId, v)}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue placeholder="Selecciona un producto" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-60 overflow-y-auto">
                                    {products.map(p => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}{p.sku ? ` (${p.sku})` : ''}
                                        <span className="ml-1 text-xs text-gray-400">· {p.currency}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input type="number" min={1}
                                value={item.quantity}
                                onChange={e => updateQty(item.tempId, parseInt(e.target.value) || 1)}
                                className="h-8 text-center text-sm" />
                            </td>
                            <td className="px-3 py-2">
                              {item.is_free ? (
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={item.product_currency || cur}
                                    onValueChange={v => updateFreeCurrency(item.tempId, v)}
                                  >
                                    <SelectTrigger className="h-8 w-20 text-xs px-2 shrink-0">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="CLP">$ CLP</SelectItem>
                                      <SelectItem value="USD">US$</SelectItem>
                                      <SelectItem value="UF">UF</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input type="number" min={0}
                                    step={(item.product_currency || cur) === 'CLP' ? '1' :
                                          (item.product_currency || cur) === 'UF'  ? '0.0001' : '0.01'}
                                    value={item.original_price}
                                    onChange={e => updatePrice(item.tempId, parseFloat(e.target.value) || 0)}
                                    className="h-8 text-right text-sm flex-1 min-w-0" />
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    {isDifferentCurrency && item.original_price > 0 && (
                                      <span
                                        className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 tabular-nums whitespace-nowrap"
                                        title={`Precio en catálogo: ${symOf(item.product_currency)} ${fmtNum(item.original_price, item.product_currency)}`}
                                      >
                                        {symOf(item.product_currency)} {fmtNum(item.original_price, item.product_currency)}
                                      </span>
                                    )}
                                    <Input type="number" min={0}
                                      step={cur === 'CLP' ? '1' : cur === 'UF' ? '0.0001' : '0.01'}
                                      value={item.unit_price}
                                      onChange={e => updatePrice(item.tempId, parseFloat(e.target.value) || 0)}
                                      className="h-8 text-right text-sm w-28" />
                                  </div>
                                  {isDifferentCurrency && (
                                    <span className="text-xs text-gray-400">{sym} convertido</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800 align-middle">
                              {sym} {fmtNum(item.subtotal, cur)}
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              <button type="button" onClick={() => removeItem(item.tempId)}
                                className="text-gray-300 transition-colors hover:text-red-500">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Descuento + IVA + Totales */}
            {items.length > 0 && (
              <div className="flex items-start justify-between gap-8">
                <div className="flex-1 space-y-4 pt-1">
                  <div className="space-y-2">
                    <Label>Descuento</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={form.discount_type}
                        onValueChange={v => { set('discount_type', v); if (v === 'none') set('discount_value', 0) }}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin descuento</SelectItem>
                          <SelectItem value="percent">Porcentaje (%)</SelectItem>
                          <SelectItem value="fixed">Monto fijo ({sym})</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.discount_type !== 'none' && (
                        <div className="flex items-center gap-1.5">
                          <Input type="number" min={0}
                            max={form.discount_type === 'percent' ? 100 : undefined}
                            step={form.discount_type === 'percent' ? '0.1' : cur === 'CLP' ? '1' : '0.01'}
                            value={form.discount_value}
                            onChange={e => set('discount_value', parseFloat(e.target.value) || 0)}
                            className="w-28" />
                          <span className="text-sm text-gray-500 shrink-0">
                            {form.discount_type === 'percent' ? '%' : sym}
                          </span>
                        </div>
                      )}
                    </div>
                    {form.discount_type !== 'none' && discountAmount > 0 && (
                      <p className="text-xs text-green-600 font-medium">
                        Ahorro: {sym} {fmtNum(discountAmount, cur)}
                      </p>
                    )}
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={form.is_tax_exempt}
                      onChange={e => set('is_tax_exempt', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer" />
                    <span className="text-sm text-gray-700">Cotización exenta de IVA</span>
                  </label>
                </div>

                <div className="w-72 shrink-0 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal ítems</span>
                    <span className="tabular-nums">{sym} {fmtNum(itemsSubtotal, cur)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento{form.discount_type === 'percent' ? ` (${form.discount_value}%)` : ''}</span>
                        <span className="tabular-nums">− {sym} {fmtNum(discountAmount, cur)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Subtotal neto</span>
                        <span className="tabular-nums">{sym} {fmtNum(netSubtotal, cur)}</span>
                      </div>
                    </>
                  )}
                  {form.is_tax_exempt ? (
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>IVA</span><span className="italic">Exento</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>IVA (19%)</span>
                      <span className="tabular-nums">{sym} {fmtNum(taxAmount, cur)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-gray-900 text-base">
                    <span>Total</span>
                    <span className="tabular-nums">
                      {sym} {fmtNum(total, cur)}
                      <span className="ml-1 text-xs font-normal text-gray-400">{cur}</span>
                    </span>
                  </div>
                  {showCLPRef && totalCLPRef && (
                    <div className="rounded-md border bg-gray-50 px-3 py-2 text-xs space-y-0.5">
                      <div className="text-gray-600 font-medium">≈ $ {fmtCLP(totalCLPRef)} CLP</div>
                      <div className="text-gray-400">
                        {cur === 'USD' && usdRate > 0 && `US$ 1 = $ ${fmtCLP(usdRate)}`}
                        {cur === 'UF'  && ufRate  > 0 && `UF 1 = $ ${fmtCLP(ufRate)}`}
                        {form.exchange_rate_date && ` · ${form.exchange_rate_date}`}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          <DialogFooter>
            {quote && (
              <Button variant="outline" className="mr-auto gap-1.5 text-gray-600"
                onClick={() => setShowPrint(true)} disabled={loading}>
                <Printer size={14} /> PDF
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPrint && quote && (
        <QuotePrintView quoteId={quote.id} onClose={() => setShowPrint(false)} />
      )}
    </>
  )
}