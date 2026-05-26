import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  Company,
  Contact,
  Profile,
  Product,
  Quote,
  QuoteLineKind,
  QuotePricingModel,
  QuoteStage,
} from '@/types'
import { normalizeQuoteStage } from '@/types'
import { Button }    from '@/components/ui/button'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Textarea }  from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, RefreshCw, Printer, PenLine } from 'lucide-react'
import QuotePrintView from './QuotePrintView'
import QuoteLinkedDocumentsBlock from '@/components/quotes/QuoteLinkedDocumentsBlock'
import QuoteInvoiceValidationDialog from '@/components/quotes/QuoteInvoiceValidationDialog'
import { fetchInvoiceForQuote } from '@/lib/quoteInvoiceFulfillment'
import { syncQuoteFollowupRemindersForStage } from '@/lib/commercialFollowupsQuery'
import { cn } from '@/lib/utils'
import QuoteAmountInput from '@/components/quotes/QuoteAmountInput'
/* ─── tipos ─────────────────────────────────────────────────────── */
type Currency     = 'CLP' | 'USD' | 'UF'
type DiscountType = 'none' | 'percent' | 'fixed'

interface LineItem {
  tempId: string
  id?: string
  is_free: boolean
  product_id: string
  product_name: string
  product_currency: string
  original_price: number
  unit_price: number
  quantity: number
  subtotal: number
  line_kind: QuoteLineKind
  pricing_model: QuotePricingModel
  inventory_item_id: string | null
}

interface Props {
  open: boolean; onClose: () => void; quote: Quote | null
  companies: Company[]; contacts: Contact[]; kams: Profile[]; products: Product[]
  initialCompanyId?: string
  initialContactId?: string
  initialCallId?: string
  onSaved: () => void
}

type FormState = {
  title: string; company_id: string; contact_id: string; kam_id: string
  stage: QuoteStage; probability: number; expected_close: string; lost_reason: string
  currency: Currency; usd_clp_rate: string; uf_clp_rate: string; exchange_rate_date: string
  valid_until: string; notes: string; is_tax_exempt: boolean
  discount_type: DiscountType; discount_value: number
}

/* ─── constantes ─────────────────────────────────────────────────── */
const STAGES: { value: QuoteStage; label: string }[] = [
  { value: 'borrador',       label: 'Borrador' },
  { value: 'en_negociacion', label: 'En negociación' },
  { value: 'enviada',        label: 'Enviada' },
  { value: 'aceptada',       label: 'Aceptada' },
  { value: 'facturada', label: 'Facturada' },
  { value: 'rechazada',      label: 'Rechazada' },
]

const TAX_RATE = 0.19

const LINE_KIND_LABEL: Record<QuoteLineKind, string> = {
  stock: 'Stock propio',
  procure: 'Comprar / fabricar',
  service: 'Servicio',
  custom: 'Ítem libre',
}

/** Catálogo: servicios → service; productos físicos → procure (sin vínculo a inventario). */
function defaultLineKindForCatalogProduct(p: Product): QuoteLineKind {
  if (p.type === 'service') return 'service'
  return 'procure'
}

const PRICING_MODEL_LABEL: Record<QuotePricingModel, string> = {
  sale: 'Venta',
  monthly_rental: 'Arriendo mensual',
}

const SYMBOL: Record<Currency, string> = { CLP: '$', USD: 'US$', UF: 'UF' }
const mkTempId = () => Math.random().toString(36).slice(2)
const today    = () => new Date().toISOString().slice(0, 10)

/** Mismas acciones compactas que la ficha empresa v2 */
const QUOTE_DIALOG_NAV_BTN =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 transition-colors shrink-0'

function scrollQuoteModalSection(elementId: string) {
  document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const EMPTY = (kamId: string): FormState => ({
  title: '', company_id: '', contact_id: '', kam_id: kamId,
  stage: 'borrador', probability: 20, expected_close: '', lost_reason: '',
  currency: 'CLP', usd_clp_rate: '', uf_clp_rate: '', exchange_rate_date: today(),
  valid_until: '', notes: '', is_tax_exempt: false,
  discount_type: 'none', discount_value: 0,
})

const fmtNum = (n: number, cur: string) => {
  if (cur === 'CLP') return new Intl.NumberFormat('es-CL').format(Math.round(n))
  if (cur === 'USD') return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}
const fmtCLP  = (n: number) => new Intl.NumberFormat('es-CL').format(Math.round(n))
const round = (n: number, cur: Currency) =>
  cur === 'CLP' ? Math.round(n) : cur === 'UF' ? parseFloat(n.toFixed(4)) : parseFloat(n.toFixed(2))

const toCLP   = (p: number, from: string, usd: number, uf: number) =>
  from === 'USD' ? p * (usd || 1) : from === 'UF' ? p * (uf || 1) : p
const fromCLP = (clp: number, to: Currency, usd: number, uf: number) =>
  to === 'USD' ? clp / (usd || 1) : to === 'UF' ? clp / (uf || 1) : clp
const convert = (p: number, from: string, to: Currency, usd: number, uf: number) =>
  from === to ? p : fromCLP(toCLP(p, from, usd, uf), to, usd, uf)
const symOf = (cur: string) => cur === 'CLP' ? '$' : cur === 'USD' ? 'US$' : cur === 'UF' ? 'UF' : cur

/* ─── componente ─────────────────────────────────────────────────── */
export default function QuoteDialog({ open, onClose, quote, companies, contacts, kams, products,
  initialCompanyId, initialContactId, initialCallId, onSaved }: Props) {
  const { profile } = useAuth()
  const [form, setForm]         = useState<FormState>(EMPTY(''))
  const [items, setItems]       = useState<LineItem[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [showPrint, setShowPrint]           = useState(false)
  const [invoicePending, setInvoicePending] = useState<{
    quoteId: string
    companyId: string
    quoteNumber: string
    quoteTotal: number
    quoteCurrency: string
  } | null>(null)
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false)

  const readonly = profile?.role === 'reader' ||
    (profile?.role === 'kam' && !!quote && quote.kam_id !== profile.id)

  const scrollToDocumentos = useCallback(() => scrollQuoteModalSection('quote-dialog-documentos'), [])

  const filteredContacts = contacts.filter(c => c.company_id === form.company_id)

  const cur     = form.currency
  const sym     = SYMBOL[cur]
  const usdRate = parseFloat(form.usd_clp_rate) || 0
  const ufRate  = parseFloat(form.uf_clp_rate)  || 0

  const itemCurrencies  = new Set(items.map(i => i.product_currency).filter(Boolean))
  const needsUsdRate    = cur === 'USD' || itemCurrencies.has('USD')
  const needsUfRate     = cur === 'UF'  || itemCurrencies.has('UF')
  const showRateSection = needsUsdRate || needsUfRate
  const hasMixed        = items.some(i => i.product_currency && i.product_currency !== cur && !i.is_free)

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

  /* cargar al abrir */
  useEffect(() => {
    if (!open) return
    setError(null)
    if (quote) {
      const q = quote as any
      setForm({
        title:              q.title             ?? '',
        company_id:         q.company_id,
        contact_id:         q.contact_id        ?? '',
        kam_id:             q.kam_id,
        stage:              normalizeQuoteStage(q.stage ?? 'borrador'),
        probability:        q.probability       ?? 20,
        expected_close:     q.expected_close    ?? '',
        lost_reason:        q.lost_reason       ?? '',
        currency:           q.currency          ?? 'CLP',
        usd_clp_rate:       q.usd_clp_rate != null ? String(q.usd_clp_rate) : '',
        uf_clp_rate:        q.uf_clp_rate  != null ? String(q.uf_clp_rate)  : '',
        exchange_rate_date: q.exchange_rate_date ?? today(),
        valid_until:        q.valid_until        ?? '',
        notes:              q.notes              ?? '',
        is_tax_exempt:      q.is_tax_exempt      ?? false,
        discount_type:      (q.discount_type     ?? 'none') as DiscountType,
        discount_value:     q.discount_value     ?? 0,
      })
      // Cargar ítems
      supabase
        .from('quote_items')
        .select(
          'id, product_id, product_name, product_currency, quantity, unit_price, subtotal, line_kind, pricing_model, inventory_item_id, product:products(price, currency, type, has_inventory)',
        )
        .eq('quote_id', quote.id)
        .then(({ data }) => {
          setItems(
            (data ?? []).map(raw => {
              const i = raw as Record<string, unknown>
              const prod = i.product as Pick<Product, 'price' | 'currency' | 'type' | 'has_inventory'> | undefined
              let line_kind = i.line_kind as QuoteLineKind | undefined
              if (!line_kind) {
                if (!i.product_id) line_kind = 'custom'
                else if (prod?.type === 'service') line_kind = 'service'
                else line_kind = 'procure'
              }
              if (line_kind === 'stock') line_kind = 'procure'
              const pricing_model = (i.pricing_model as QuotePricingModel) ?? 'sale'

              return {
                tempId: mkTempId(),
                id: i.id as string,
                is_free: !i.product_id,
                product_id: (i.product_id as string) ?? '',
                product_name: (i.product_name as string) ?? '',
                product_currency:
                  (i.product_currency as string) ?? prod?.currency ?? '',
                original_price: prod?.price ?? Number(i.unit_price),
                unit_price: Number(i.unit_price),
                quantity: Number(i.quantity),
                subtotal: Number(i.subtotal),
                line_kind,
                pricing_model,
                inventory_item_id: (i.inventory_item_id as string | null) ?? null,
              }
            }),
          )
        })
    } else {
      const base: FormState = {
        ...EMPTY(profile?.id ?? ''),
        company_id: initialCompanyId ?? '',
        contact_id: initialContactId ?? '',
      }
      setForm(base)
      setItems([])
      // Auto-cargar KAM lead si viene con empresa pre-llenada
      if (initialCompanyId && profile?.role !== 'kam') {
        supabase.from('company_kams').select('kam_id')
          .eq('company_id', initialCompanyId).eq('is_lead', true).single()
          .then(({ data }) => {
            if (data?.kam_id)
              setForm(prev => ({ ...prev, kam_id: data.kam_id }))
          })
      }
    }
  }, [open, quote?.id]) // eslint-disable-line

  const set = (field: keyof FormState, value: string | number | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleCompanyChange = async (companyId: string) => {
    setForm(prev => ({ ...prev, company_id: companyId, contact_id: '' }))
    if (profile?.role !== 'kam') {
      const { data } = await supabase.from('company_kams').select('kam_id')
        .eq('company_id', companyId).eq('is_lead', true).single()
      if (data?.kam_id)
        setForm(prev => ({ ...prev, company_id: companyId, contact_id: '', kam_id: data.kam_id }))
    }
  }

  /* items */
  const addCatalogItem = () =>
    setItems(prev => [
      ...prev,
      {
        tempId: mkTempId(),
        is_free: false,
        product_id: '',
        product_name: '',
        product_currency: '',
        original_price: 0,
        unit_price: 0,
        quantity: 1,
        subtotal: 0,
        line_kind: 'procure',
        pricing_model: 'sale',
        inventory_item_id: null,
      },
    ])
  const addFreeItem = () =>
    setItems(prev => [
      ...prev,
      {
        tempId: mkTempId(),
        is_free: true,
        product_id: '',
        product_name: '',
        product_currency: cur,
        original_price: 0,
        unit_price: 0,
        quantity: 1,
        subtotal: 0,
        line_kind: 'custom',
        pricing_model: 'sale',
        inventory_item_id: null,
      },
    ])
  const removeItem = (tempId: string) => setItems(prev => prev.filter(i => i.tempId !== tempId))

  const updateProduct = (tempId: string, productId: string) => {
    const p = products.find(x => x.id === productId)
    if (!p) return
    const converted = convert(p.price, p.currency, cur, usdRate, ufRate)
    const lk = defaultLineKindForCatalogProduct(p)
    setItems(prev =>
      prev.map(i =>
        i.tempId !== tempId
          ? i
          : {
              ...i,
              product_id: p.id,
              product_name: p.name,
              product_currency: p.currency,
              original_price: p.price,
              unit_price: converted,
              subtotal: converted * i.quantity,
              line_kind: lk,
              inventory_item_id: null,
            },
      ),
    )
  }
  const updatePricingModel = (tempId: string, model: QuotePricingModel) => {
    setItems(prev => prev.map(i => (i.tempId !== tempId ? i : { ...i, pricing_model: model })))
  }

  const updateQty = (tempId: string, qty: number) => setItems(prev => prev.map(i => {
    if (i.tempId !== tempId) return i
    const q = Math.max(1, qty)
    return { ...i, quantity: q, subtotal: i.unit_price * q }
  }))
  const updatePrice = (tempId: string, price: number) => setItems(prev => prev.map(i => {
    if (i.tempId !== tempId) return i
    const p = Math.max(0, price)
    if (i.is_free) {
      const converted = convert(p, i.product_currency, cur, usdRate, ufRate)
      return { ...i, original_price: p, unit_price: converted, subtotal: converted * i.quantity }
    }
    return { ...i, unit_price: p, subtotal: p * i.quantity }
  }))
  const updateFreeName     = (tempId: string, name: string) =>
    setItems(prev => prev.map(i => i.tempId !== tempId ? i : { ...i, product_name: name }))
  const updateFreeCurrency = (tempId: string, newCur: string) =>
    setItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i
      const converted = convert(i.original_price, newCur, cur, usdRate, ufRate)
      return { ...i, product_currency: newCur, unit_price: converted, subtotal: converted * i.quantity }
    }))
  const recalcItems = () => setItems(prev => prev.map(i => {
    if (!i.product_currency) return i
    const converted = convert(i.original_price, i.product_currency, cur, usdRate, ufRate)
    return { ...i, unit_price: converted, subtotal: converted * i.quantity }
  }))

  /* guardar */
  const handleSave = async () => {
    if (!form.company_id)         { setError('Selecciona una empresa'); return }
    if (!form.kam_id)             { setError('Selecciona un KAM'); return }
    if (!form.title.trim())       { setError('El título es obligatorio'); return }
    if (needsUsdRate && !usdRate) { setError('Ingresa el tipo de cambio USD → CLP'); return }
    if (needsUfRate  && !ufRate)  { setError('Ingresa el tipo de cambio UF → CLP'); return }

    setLoading(true)
    setError(null)
    try {
      const prevStage = quote ? normalizeQuoteStage(quote.stage) : 'borrador'
      let saveStage = form.stage
      let openInvoiceAfter = false
      if (form.stage === 'facturada' && prevStage !== 'facturada') {
        if (!quote?.id) {
          setError('Guarde la cotización antes de marcarla como facturada.')
          setLoading(false)
          return
        }
        const existingInv = await fetchInvoiceForQuote(quote.id)
        if (!existingInv) {
          saveStage = prevStage
          openInvoiceAfter = true
        }
      }

      let quoteNumber = quote?.quote_number
      if (!quote) {
        const { count } = await supabase.from('quotes').select('id', { count: 'exact', head: true })
        quoteNumber = `COT-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      }

      const closed = ['aceptada', 'rechazada', 'facturada'].includes(saveStage)
      const payload: Record<string, unknown> = {
        company_id: form.company_id, contact_id: form.contact_id || null,
        kam_id: form.kam_id, title: form.title.trim(),
        stage: saveStage, probability: form.probability,
        expected_close: form.expected_close || null,
        lost_reason: form.stage === 'rechazada' ? form.lost_reason || null : null,
        closed_at: closed ? (quote?.closed_at ?? new Date().toISOString()) : null,
        call_id: !quote && initialCallId ? initialCallId : undefined,
        currency: cur,
        usd_clp_rate: usdRate > 0 ? usdRate : null,
        uf_clp_rate:  ufRate  > 0 ? ufRate  : null,
        exchange_rate_date: (needsUsdRate || needsUfRate) ? form.exchange_rate_date || null : null,
        valid_until: form.valid_until || null, notes: form.notes || null,
        is_tax_exempt: form.is_tax_exempt,
        discount_type:   form.discount_type !== 'none' ? form.discount_type : null,
        discount_value:  form.discount_type !== 'none' ? form.discount_value : 0,
        discount_amount: round(discountAmount, cur),
        subtotal:        round(netSubtotal, cur),
        tax_amount:      round(taxAmount, cur),
        total:           round(total, cur),
      }
      if (!quote) payload.quote_number = quoteNumber

      const { data: saved, error: qErr } = quote
        ? await supabase.from('quotes').update(payload).eq('id', quote.id).select().single()
        : await supabase.from('quotes').insert(payload).select().single()
      if (qErr) throw qErr

      if (items.length > 0) {
        const { error: delErr } = await supabase.from('quote_items').delete().eq('quote_id', saved.id)
        if (delErr) throw delErr
        const { error: insErr } = await supabase.from('quote_items').insert(
          items.map(i => ({
            quote_id: saved.id,
            product_id: i.is_free ? null : i.product_id || null,
            product_name: i.product_name,
            product_currency: i.product_currency || null,
            quantity: i.quantity,
            unit_price: round(i.unit_price, cur),
            subtotal: round(i.subtotal, cur),
            line_kind: i.is_free ? 'custom' : i.line_kind,
            pricing_model: i.pricing_model,
            procurement_plan: !i.is_free && i.line_kind === 'procure' ? 'manufacture' : null,
            inventory_item_id: null,
          })),
        )
        if (insErr) throw insErr
      } else {
        const { error: delEmptyErr } = await supabase.from('quote_items').delete().eq('quote_id', saved.id)
        if (delEmptyErr) throw delEmptyErr
      }

      if (openInvoiceAfter) {
        setInvoicePending({
          quoteId: saved.id as string,
          companyId: form.company_id,
          quoteNumber: (saved.quote_number as string) ?? quoteNumber ?? '',
          quoteTotal: Number(saved.total) || total,
          quoteCurrency: (saved.currency as string) || cur,
        })
        setInvoiceModalOpen(true)
        setForm(f => ({ ...f, stage: prevStage }))
        return
      }

      if (quote?.id && normalizeQuoteStage(prevStage) !== normalizeQuoteStage(saveStage)) {
        await syncQuoteFollowupRemindersForStage(quote.id, prevStage, saveStage)
      }

      onSaved()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!quote || !confirm('¿Eliminar esta cotización?')) return
    await supabase.from('quote_items').delete().eq('quote_id', quote.id)
    await supabase.from('quotes').delete().eq('id', quote.id)
    onSaved()
  }

  if (!open) return null

  return (
    <>
      {invoicePending && (
        <QuoteInvoiceValidationDialog
          open={invoiceModalOpen}
          quoteId={invoicePending.quoteId}
          companyId={invoicePending.companyId}
          quoteNumber={invoicePending.quoteNumber}
          quoteTotal={invoicePending.quoteTotal}
          quoteCurrency={invoicePending.quoteCurrency}
          onClose={() => setInvoiceModalOpen(false)}
          onCompleted={() => {
            setInvoicePending(null)
            setInvoiceModalOpen(false)
            onSaved()
            onClose()
          }}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-4xl mx-4 flex flex-col max-h-[92vh]">

          {/* Header — tipografía alineada a ficha empresa v2 */}
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/80 flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900 shrink-0">
                {quote ? quote.quote_number : 'Nueva cotización'}
              </h2>
              {quote?.id && (
                <>
                  <span className="hidden sm:inline text-gray-300 select-none" aria-hidden>
                    |
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={QUOTE_DIALOG_NAV_BTN} onClick={scrollToDocumentos}>
                      Documentos
                    </button>
                  </div>
                </>
              )}
              {readonly && <p className="text-xs text-gray-400 w-full sm:w-auto">Solo lectura</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0"
              aria-label="Cerrar"
            >
              &times;
            </button>
          </div>

          {invoicePending && !invoiceModalOpen && (
            <div className="mx-4 mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <p className="text-xs text-violet-900">
                Tiene una facturación en curso. Puede volver al formulario sin perder lo ingresado.
              </p>
              <Button type="button" size="sm" className="h-8 text-xs" onClick={() => setInvoiceModalOpen(true)}>
                Continuar facturación
              </Button>
            </div>
          )}

          {/* Body */}
          <div
            className={cn(
              'flex-1 px-4 py-4 space-y-5 scroll-smooth',
              invoiceModalOpen ? 'overflow-hidden' : 'overflow-y-auto',
            )}
          >

            {/* Info básica */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-medium text-gray-600">Título / Nombre del negocio *</Label>
                <Input value={form.title} onChange={e => set('title', e.target.value)}
                  placeholder="Ej: Renovación licencias 2025" disabled={readonly} />
              </div>

              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-medium text-gray-600">Empresa *</Label>
                <Select value={form.company_id || '__none__'}
                  onValueChange={v => v !== '__none__' && handleCompanyChange(v)} disabled={readonly}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.company_id && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    <Link
                      to={`/companies/${form.company_id}/v2?cfTab=quotes`}
                      className="text-sm font-medium text-violet-700 hover:text-violet-900 hover:underline"
                    >
                      {companies.find(c => c.id === form.company_id)?.name ?? 'Ver ficha de la empresa'}
                    </Link>
                    <span className="text-gray-400"> — ficha v2</span>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Contacto</Label>
                <Select value={form.contact_id || '__none__'}
                  onValueChange={v => set('contact_id', v === '__none__' ? '' : v)}
                  disabled={readonly || !form.company_id}>
                  <SelectTrigger><SelectValue placeholder={form.company_id ? 'Opcional' : 'Primero elige empresa'} /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">— Sin contacto —</SelectItem>
                    {filteredContacts.map(c => {
                      const name = `${c.first_name} ${c.last_name}`.trim() || 'Contacto'
                      const cargo = c.position?.trim()
                      const label = cargo ? `${name} - ${cargo}` : name
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">KAM</Label>
                <Select value={form.kam_id || '__none__'}
                  onValueChange={v => set('kam_id', v === '__none__' ? '' : v)}
                  disabled={readonly || profile?.role === 'kam'}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un KAM" /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {kams.map(k => <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Estado</Label>
                <Select value={form.stage} onValueChange={v => set('stage', v)} disabled={readonly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Probabilidad (%)</Label>
                <Input type="number" min={0} max={100} value={form.probability}
                  onChange={e => set('probability', parseInt(e.target.value) || 0)} disabled={readonly} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Cierre estimado</Label>
                <Input type="date" value={form.expected_close}
                  onChange={e => set('expected_close', e.target.value)} disabled={readonly} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Válido hasta</Label>
                <Input type="date" value={form.valid_until}
                  onChange={e => set('valid_until', e.target.value)} disabled={readonly} />
              </div>

              {form.stage === 'rechazada' && (
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs font-medium text-gray-600">Motivo de rechazo</Label>
                  <Input value={form.lost_reason} onChange={e => set('lost_reason', e.target.value)}
                    placeholder="¿Por qué fue rechazada?" disabled={readonly} />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-600">Moneda *</Label>
                <Select value={cur} onValueChange={v => set('currency', v)} disabled={readonly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLP">$ — Peso chileno (CLP)</SelectItem>
                    <SelectItem value="USD">US$ — Dólar americano</SelectItem>
                    <SelectItem value="UF">UF — Unidad de Fomento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-medium text-gray-600">Notas</Label>
                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Observaciones..." rows={2} disabled={readonly} />
              </div>
            </div>

            {/* Tipos de cambio */}
            {showRateSection && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-900">Tipos de cambio</p>
                    <p className="text-xs text-amber-700 mt-0.5">Precios convertidos a <strong>{sym} ({cur})</strong></p>
                  </div>
                  <div className="space-y-1 text-right">
                    <Label className="text-xs text-amber-800">Fecha referencia</Label>
                    <Input type="date" value={form.exchange_rate_date}
                      onChange={e => set('exchange_rate_date', e.target.value)}
                      className="h-8 text-sm w-40 bg-white" disabled={readonly} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {needsUsdRate && (
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-amber-900">1 US$ equivale a</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                        <Input type="number" min={0} step="0.01" placeholder="Ej: 960"
                          value={form.usd_clp_rate} onChange={e => set('usd_clp_rate', e.target.value)}
                          className="pl-7 bg-white" disabled={readonly} />
                      </div>
                      {usdRate > 0 && <p className="text-xs text-amber-700">US$ 1 = $ {fmtCLP(usdRate)} CLP</p>}
                    </div>
                  )}
                  {needsUfRate && (
                    <div className="space-y-1">
                      <Label className="text-sm font-medium text-amber-900">1 UF equivale a</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                        <Input type="number" min={0} step="1" placeholder="Ej: 37500"
                          value={form.uf_clp_rate} onChange={e => set('uf_clp_rate', e.target.value)}
                          className="pl-7 bg-white" disabled={readonly} />
                      </div>
                      {ufRate > 0 && <p className="text-xs text-amber-700">UF 1 = $ {fmtCLP(ufRate)} CLP</p>}
                    </div>
                  )}
                </div>
                {hasMixed && !readonly && (
                  <div className="pt-1 border-t border-amber-200">
                    <Button type="button" size="sm" variant="outline" onClick={recalcItems}
                      className="bg-white text-amber-800 border-amber-300 hover:bg-amber-50">
                      <RefreshCw size={13} className="mr-1.5" /> Recalcular precios
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Ítems */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 text-sm">Ítems</h3>
                  <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{sym} · {cur}</span>
                  <span className="text-xs text-gray-400">(opcional)</span>
                </div>
                {!readonly && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={addFreeItem}>
                      <PenLine size={14} className="mr-1" /> Ítem libre
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={addCatalogItem}>
                      <Plus size={14} className="mr-1" /> Del catálogo
                    </Button>
                  </div>
                )}
              </div>

              {items.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                  Sin ítems — una cotización básica puede guardarse sin ítems
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Producto</th>
                        <th className="w-20 px-3 py-2 text-center text-xs font-medium text-gray-600">Cant.</th>
                        <th className="w-44 px-3 py-2 text-right text-xs font-medium text-gray-600">Precio original</th>
                        <th className="w-36 px-3 py-2 text-right text-xs font-medium text-gray-600">Subtotal ({sym})</th>
                        {!readonly && <th className="w-8" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map(item => {
                        const isDiff = !item.is_free && item.product_currency && item.product_currency !== cur
                        const prodRow = products.find(x => x.id === item.product_id)
                        return (
                          <tr key={item.tempId} className={item.is_free ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}>
                            <td className="px-3 py-2 align-middle min-w-0">
                              {item.is_free ? (
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 text-xs bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
                                    {LINE_KIND_LABEL.custom}
                                  </span>
                                  <Input
                                    value={item.product_name}
                                    onChange={e => updateFreeName(item.tempId, e.target.value)}
                                    placeholder="Descripción..."
                                    className="h-8 text-sm flex-1 min-w-0"
                                    disabled={readonly}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="min-w-0 flex-1">
                                      <Select
                                        value={item.product_id || '__none__'}
                                        onValueChange={v => v !== '__none__' && updateProduct(item.tempId, v)}
                                        disabled={readonly}
                                      >
                                        <SelectTrigger className="h-9 text-sm w-full min-w-0">
                                          {item.product_id && prodRow ? (
                                            <span className="truncate text-left w-full block">
                                              <span className="font-medium text-gray-900">{prodRow.name}</span>
                                              {prodRow.description?.trim() ? (
                                                <span className="text-gray-500">{` · ${prodRow.description.trim()}`}</span>
                                              ) : null}
                                            </span>
                                          ) : (
                                            <SelectValue placeholder="Selecciona un producto" />
                                          )}
                                        </SelectTrigger>
                                        <SelectContent className="z-[110] max-h-60 overflow-y-auto">
                                          {products.map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                              {p.name}{p.sku ? ` (${p.sku})` : ''}
                                              <span className="ml-1 text-xs text-gray-400">· {p.currency}</span>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {prodRow?.type === 'service' && (
                                      <span className="text-xs rounded bg-gray-100 text-gray-700 px-2 py-0.5 shrink-0 whitespace-nowrap">
                                        {LINE_KIND_LABEL.service}
                                      </span>
                                    )}
                                    {prodRow && prodRow.type !== 'service' && (
                                      <span className="text-xs rounded bg-gray-100 text-gray-700 px-2 py-0.5 shrink-0 whitespace-nowrap">
                                        {LINE_KIND_LABEL.procure}
                                      </span>
                                    )}
                                    {readonly ? (
                                      <span className="text-xs rounded bg-violet-50 text-violet-800 px-2 py-0.5 shrink-0 whitespace-nowrap">
                                        {PRICING_MODEL_LABEL[item.pricing_model]}
                                      </span>
                                    ) : (
                                      <Select
                                        value={item.pricing_model}
                                        onValueChange={v => updatePricingModel(item.tempId, v as QuotePricingModel)}
                                      >
                                        <SelectTrigger className="h-7 min-w-[7.5rem] w-[132px] text-xs shrink-0">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="sale">{PRICING_MODEL_LABEL.sale}</SelectItem>
                                          <SelectItem value="monthly_rental">{PRICING_MODEL_LABEL.monthly_rental}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              <Input type="number" min={1} value={item.quantity}
                                onChange={e => updateQty(item.tempId, parseInt(e.target.value) || 1)}
                                className="h-8 text-center text-sm" disabled={readonly} />
                            </td>
                            <td className="px-3 py-2 align-middle">
                              {item.is_free ? (
                                <div className="flex items-center gap-1">
                                  <Select value={item.product_currency || cur}
                                    onValueChange={v => updateFreeCurrency(item.tempId, v)} disabled={readonly}>
                                    <SelectTrigger className="h-8 w-20 text-xs px-2 shrink-0"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="CLP">$ CLP</SelectItem>
                                      <SelectItem value="USD">US$</SelectItem>
                                      <SelectItem value="UF">UF</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <QuoteAmountInput
                                    value={item.original_price}
                                    currency={item.product_currency || cur}
                                    onChange={p => updatePrice(item.tempId, p)}
                                    disabled={readonly}
                                    className="h-8 text-right text-sm flex-1 min-w-0"
                                  />
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    {isDiff && item.original_price > 0 && (
                                      <span className="text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 tabular-nums whitespace-nowrap">
                                        {symOf(item.product_currency)} {fmtNum(item.original_price, item.product_currency)}
                                      </span>
                                    )}
                                    <QuoteAmountInput
                                      value={item.unit_price}
                                      currency={cur}
                                      onChange={p => updatePrice(item.tempId, p)}
                                      disabled={readonly}
                                      className="h-8 text-right text-sm w-32"
                                    />
                                  </div>
                                  {isDiff && <span className="text-xs text-gray-400">{sym} convertido</span>}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800 align-middle">
                              {sym} {fmtNum(item.subtotal, cur)}
                            </td>
                            {!readonly && (
                              <td className="px-2 py-2 text-center align-middle">
                                <button type="button" onClick={() => removeItem(item.tempId)}
                                  className="text-gray-300 hover:text-red-500 transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>

            {/* Descuento + IVA + Totales */}
            {items.length > 0 && (
              <div className="flex items-start justify-between gap-8">
                <div className="flex-1 space-y-4 pt-1">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-600">Descuento</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select value={form.discount_type}
                        onValueChange={v => { set('discount_type', v); if (v === 'none') set('discount_value', 0) }}
                        disabled={readonly}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin descuento</SelectItem>
                          <SelectItem value="percent">Porcentaje (%)</SelectItem>
                          <SelectItem value="fixed">Monto fijo ({sym})</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.discount_type !== 'none' && (
                        <Input type="number" min={0}
                          max={form.discount_type === 'percent' ? 100 : undefined}
                          step={form.discount_type === 'percent' ? '0.1' : '1'}
                          value={form.discount_value}
                          onChange={e => set('discount_value', parseFloat(e.target.value) || 0)}
                          className="w-28" disabled={readonly} />
                      )}
                    </div>
                    {discountAmount > 0 && (
                      <p className="text-xs text-green-600 font-medium">Ahorro: {sym} {fmtNum(discountAmount, cur)}</p>
                    )}
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={form.is_tax_exempt}
                      onChange={e => set('is_tax_exempt', e.target.checked)} disabled={readonly}
                      className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer" />
                    <span className="text-sm text-gray-700">Exento de IVA</span>
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
                  {form.is_tax_exempt
                    ? <div className="flex justify-between text-sm text-gray-400"><span>IVA</span><span className="italic">Exento</span></div>
                    : <div className="flex justify-between text-sm text-gray-600"><span>IVA (19%)</span><span className="tabular-nums">{sym} {fmtNum(taxAmount, cur)}</span></div>
                  }
                  <Separator />
                  <div className="flex justify-between font-semibold text-gray-900 text-base">
                    <span>Total</span>
                    <span className="tabular-nums">{sym} {fmtNum(total, cur)} <span className="text-xs font-normal text-gray-400">{cur}</span></span>
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

            {quote?.id && form.company_id && (
              <QuoteLinkedDocumentsBlock key={quote.id} quoteId={quote.id} companyId={form.company_id} canEdit={!readonly} />
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2 shrink-0 bg-gray-50/50">
            {quote && profile?.role === 'super_admin' && (
              <Button variant="destructive" onClick={handleDelete} className="mr-auto">Eliminar</Button>
            )}
            {quote && (
              <Button variant="outline" onClick={() => setShowPrint(true)} className="gap-1.5">
                <Printer size={14} /> PDF
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            {!readonly && (
              <Button onClick={handleSave} disabled={loading}>
                {loading ? 'Guardando...' : quote ? 'Guardar cambios' : 'Crear cotización'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Vista de impresión */}
      {showPrint && quote && (
        <QuotePrintView quoteId={quote.id} onClose={() => setShowPrint(false)} />
      )}

    </>
  )
}