import { supabase } from '@/lib/supabase'
import type { Quote } from '@/types'

interface QuoteItemRow {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  line_kind?: string | null
  pricing_model?: string | null
}

const SYMBOL: Record<string, string> = { CLP: '$', USD: 'US$', UF: 'UF' }

function fmtAmount(n: number, cur: string): string {
  if (cur === 'CLP') return new Intl.NumberFormat('es-CL').format(Math.round(n))
  if (cur === 'USD') {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  }
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

/** Texto plano con detalle de cotización para glosa de factura (editable en el formulario). */
export function buildQuoteInvoiceGlosaText(
  quote: Pick<
    Quote,
    | 'quote_number'
    | 'title'
    | 'currency'
    | 'subtotal'
    | 'tax_amount'
    | 'total'
    | 'discount_type'
    | 'discount_value'
    | 'discount_amount'
    | 'is_tax_exempt'
  >,
  items: QuoteItemRow[],
): string {
  const cur = quote.currency ?? 'CLP'
  const sym = SYMBOL[cur] ?? cur
  const lines: string[] = []

  const header = [quote.quote_number, quote.title?.trim()].filter(Boolean).join(' — ')
  if (header) lines.push(header)
  lines.push('')

  if (items.length === 0) {
    lines.push('(Sin líneas de detalle)')
  } else {
    for (const item of items) {
      const qty = Math.max(0, Number(item.quantity) || 0)
      const unit = Number(item.unit_price) || 0
      const sub = Number(item.subtotal) || unit * qty
      const name = (item.product_name ?? '').trim() || 'Ítem'
      lines.push(`• ${name} x ${qty} — ${sym} ${fmtAmount(unit, cur)} c/u — ${sym} ${fmtAmount(sub, cur)}`)
    }
  }

  lines.push('')
  lines.push(`Subtotal neto: ${sym} ${fmtAmount(Number(quote.subtotal) || 0, cur)}`)

  const discountAmt = Number(quote.discount_amount) || 0
  if (discountAmt > 0) {
    const discLabel =
      quote.discount_type === 'percent' && quote.discount_value
        ? `Descuento (${quote.discount_value}%):`
        : 'Descuento:'
    lines.push(`${discLabel} -${sym} ${fmtAmount(discountAmt, cur)}`)
  }

  if (quote.is_tax_exempt) {
    lines.push('IVA: Exento')
  } else {
    lines.push(`IVA (19%): ${sym} ${fmtAmount(Number(quote.tax_amount) || 0, cur)}`)
  }

  lines.push(`TOTAL: ${sym} ${fmtAmount(Number(quote.total) || 0, cur)} ${cur}`)

  return lines.join('\n').trim()
}

export async function fetchQuoteInvoiceGlosaText(quoteId: string): Promise<string> {
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select(
      'quote_number, title, currency, subtotal, tax_amount, total, discount_type, discount_value, discount_amount, is_tax_exempt',
    )
    .eq('id', quoteId)
    .maybeSingle()

  if (qErr) throw new Error(qErr.message)
  if (!quote) return ''

  const { data: items, error: iErr } = await supabase
    .from('quote_items')
    .select('product_name, quantity, unit_price, subtotal, line_kind, pricing_model')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true })

  if (iErr) throw new Error(iErr.message)

  return buildQuoteInvoiceGlosaText(quote as Quote, (items ?? []) as QuoteItemRow[])
}
