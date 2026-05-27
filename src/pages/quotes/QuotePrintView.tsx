import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { COMPANY } from '@/config/company'
import { fetchCrmAppSettingsMerged, mergedToPrintIssuer } from '@/lib/crmAppSettings'
import { Button } from '@/components/ui/button'
import { Printer, X } from 'lucide-react'

interface QuoteItem {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  discount_pct: number
  line_subtotal: number
  line_tax: number
  line_total: number
  product_currency?: string
  /** v2 cotización */
  line_kind?: string
  pricing_model?: string
  procurement_plan?: string | null
}

interface QuoteData {
  id: string
  quote_number: string
  stage?: string
  status?: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  discount_amount?: number
  discount_type?: string
  discount_value?: number
  is_tax_exempt?: boolean
  valid_until?: string
  notes?: string
  created_at: string
  usd_clp_rate?: number
  uf_clp_rate?: number
  exchange_rate_date?: string
  company?: { name: string; rut?: string; address?: string; city?: string; phone?: string }
  contact?: { first_name: string; last_name: string; position?: string; email?: string; phone?: string }
  kam?: { full_name: string }
}

interface Props {
  quoteId: string
  onClose: () => void
}

const SYMBOL: Record<string, string> = { CLP: '$', USD: 'US$', UF: 'UF' }

const fmtNum = (n: number, cur: string) => {
  if (cur === 'CLP') return new Intl.NumberFormat('es-CL').format(Math.round(n))
  if (cur === 'USD') return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })

/** Emisor en impresión (defaults + posible merge desde Supabase) */
type PrintIssuer = {
  name: string
  rut: string
  address: string
  phone: string
  email: string
  website: string
}

export default function QuotePrintView({ quoteId, onClose }: Props) {
  const [quote, setQuote]     = useState<QuoteData | null>(null)
  const [items, setItems]     = useState<QuoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')
  const [issuer, setIssuer]   = useState<PrintIssuer>({
    name: COMPANY.name,
    rut: COMPANY.rut,
    address: COMPANY.address,
    phone: COMPANY.phone,
    email: COMPANY.email,
    website: COMPANY.website,
  })

  useEffect(() => {
    void fetchCrmAppSettingsMerged()
      .then(m => setIssuer(mergedToPrintIssuer(m)))
      .catch(() => { /* mantiene valores de COMPANY */ })
  }, [])

  useEffect(() => {
    setLoading(true)
    setErr('')
    Promise.all([
      supabase
        .from('quotes')
        .select(`*, company:companies(name,rut,address,city,phone), contact:contacts(first_name,last_name,position,email,phone), kam:profiles(full_name)`)
        .eq('id', quoteId)
        .single(),
      supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true }),
    ]).then(([{ data: q, error: qErr }, { data: i, error: iErr }]) => {
      if (qErr || iErr) {
        setErr((qErr ?? iErr)?.message ?? 'Error cargando datos')
      } else {
        setQuote(q as QuoteData)
        setItems((i as QuoteItem[]) ?? [])
      }
      setLoading(false)
    })
  }, [quoteId])

  const handlePrint = () => {
    const doc = document.getElementById('print-document')
    if (!doc || !quote) return

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${quote.quote_number}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; background: white; }
      @page { margin: 1.5cm; size: A4; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>${doc.innerHTML}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 600)
  }

  if (loading) return (
    <div className="fixed inset-0 z-[100] bg-white flex items-center justify-center">
      <p className="text-gray-400 text-sm">Cargando documento...</p>
    </div>
  )

  if (err) return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center gap-4">
      <p className="text-red-500 text-sm">{err}</p>
      <Button variant="outline" onClick={onClose}>Cerrar</Button>
    </div>
  )

  if (!quote) return null

  const stage = quote.stage ?? quote.status ?? ''
  const isFacturada =
    stage === 'facturada' ||
    stage === 'orden_de_venta' ||
    (stage === 'pendiente_facturar' && !!(quote as { closed_at?: string | null }).closed_at)
  const sym          = SYMBOL[quote.currency] ?? '$'
  const cur          = quote.currency
  const title        = isFacturada ? 'FACTURA / CIERRE' : 'COTIZACIÓN'
  const hasDiscount  = quote.discount_amount != null && Number(quote.discount_amount) > 0
  const hasItemDcto  = items.some(i => Number(i.discount_pct) > 0)

  return (
    <div className="fixed inset-0 z-[100] bg-gray-800/60 flex items-start justify-center pt-8 px-4 pb-4 overflow-y-auto">

      {/* Botones flotantes */}
      <div className="fixed top-4 right-4 flex gap-2 z-[101]">
        <Button onClick={handlePrint} className="gap-2 shadow-lg">
          <Printer size={15} /> Imprimir / Guardar PDF
        </Button>
        <Button variant="outline" onClick={onClose} className="gap-2 bg-white shadow-lg">
          <X size={15} /> Cerrar
        </Button>
      </div>

      {/* Documento — este es el que se clona a la ventana nueva */}
      <div
        id="print-document"
        className="bg-white w-full max-w-3xl shadow-2xl rounded-lg overflow-hidden mt-10"
        style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 13 }}
      >
        {/* Header */}
        <div style={{ background: '#1e293b', color: 'white', padding: '28px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{issuer.name}</div>
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>RUT {issuer.rut}</div>
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>{issuer.address}</div>
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>{issuer.phone} · {issuer.email}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>{title}</div>
              <div style={{ fontSize: 15, marginTop: 4, opacity: 0.9, fontWeight: 600 }}>{quote.quote_number}</div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>Fecha: {fmtDate(quote.created_at)}</div>
              {quote.valid_until && (
                <div style={{ fontSize: 11, opacity: 0.7 }}>Válida hasta: {fmtDate(quote.valid_until)}</div>
              )}
            </div>
          </div>
        </div>

        {/* Cliente + KAM */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ padding: '20px 36px', borderRight: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Cliente</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{quote.company?.name ?? '—'}</div>
            {quote.company?.rut     && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>RUT {quote.company.rut}</div>}
            {quote.company?.address && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{quote.company.address}{quote.company.city ? `, ${quote.company.city}` : ''}</div>}
            {quote.company?.phone   && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{quote.company.phone}</div>}
            {quote.contact && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Contacto</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{quote.contact.first_name} {quote.contact.last_name}</div>
                {quote.contact.position && <div style={{ fontSize: 11, color: '#64748b' }}>{quote.contact.position}</div>}
                {quote.contact.email    && <div style={{ fontSize: 11, color: '#64748b' }}>{quote.contact.email}</div>}
                {quote.contact.phone    && <div style={{ fontSize: 11, color: '#64748b' }}>{quote.contact.phone}</div>}
              </div>
            )}
          </div>
          <div style={{ padding: '20px 36px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Ejecutivo de cuenta</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{quote.kam?.full_name ?? '—'}</div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Moneda</div>
              <div style={{ fontSize: 12 }}>{cur}{cur !== 'CLP' ? ` (${sym})` : ''}</div>
              {quote.usd_clp_rate && Number(quote.usd_clp_rate) > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  US$ 1 = $ {new Intl.NumberFormat('es-CL').format(Math.round(Number(quote.usd_clp_rate)))} CLP
                  {quote.exchange_rate_date ? ` · ${fmtDate(quote.exchange_rate_date)}` : ''}
                </div>
              )}
              {quote.uf_clp_rate && Number(quote.uf_clp_rate) > 0 && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  UF 1 = $ {new Intl.NumberFormat('es-CL').format(Math.round(Number(quote.uf_clp_rate)))} CLP
                  {quote.exchange_rate_date ? ` · ${fmtDate(quote.exchange_rate_date)}` : ''}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabla ítems */}
        <div style={{ padding: '24px 36px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left',   padding: '8px 10px', fontWeight: 600, color: '#475569', fontSize: 11 }}>Descripción</th>
                <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600, color: '#475569', fontSize: 11, width: 60 }}>Cant.</th>
                <th style={{ textAlign: 'right',  padding: '8px 10px', fontWeight: 600, color: '#475569', fontSize: 11, width: 130 }}>P. Unitario</th>
                {hasItemDcto && (
                  <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600, color: '#475569', fontSize: 11, width: 70 }}>Dcto.</th>
                )}
                <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600, color: '#475569', fontSize: 11, width: 130 }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const metaParts: string[] = []
                if (item.pricing_model === 'monthly_rental') metaParts.push('Arriendo mensual')
                if (item.line_kind === 'procure') {
                  if (item.procurement_plan === 'purchase') metaParts.push('Compra para el proyecto')
                  else if (item.procurement_plan === 'manufacture') metaParts.push('Fabricación')
                  else metaParts.push('Compra / fabricación')
                }
                return (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '9px 10px', color: '#1e293b' }}>
                    {item.product_name}
                    {metaParts.length > 0 && (
                      <span style={{ display: 'block', fontSize: 10, color: '#64748b', marginTop: 3 }}>
                        {metaParts.join(' · ')}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'center', color: '#475569' }}>
                    {Number(item.quantity) % 1 === 0 ? Math.round(Number(item.quantity)) : Number(item.quantity)}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#475569' }}>
                    {sym} {fmtNum(Number(item.unit_price), cur)}
                  </td>
                  {hasItemDcto && (
                    <td style={{ padding: '9px 10px', textAlign: 'right', color: '#64748b' }}>
                      {Number(item.discount_pct) > 0 ? `${item.discount_pct}%` : '—'}
                    </td>
                  )}
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                    {sym} {fmtNum(Number(item.line_subtotal ?? Number(item.unit_price) * Number(item.quantity)), cur)}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div style={{ padding: '0 36px 28px', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 260 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#475569' }}>
              <span>Subtotal neto</span>
              <span>{sym} {fmtNum(Number(quote.subtotal), cur)}</span>
            </div>
            {hasDiscount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#16a34a' }}>
                <span>Descuento{quote.discount_type === 'percent' ? ` (${quote.discount_value}%)` : ''}</span>
                <span>− {sym} {fmtNum(Number(quote.discount_amount), cur)}</span>
              </div>
            )}
            {quote.is_tax_exempt ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#94a3b8' }}>
                <span>IVA</span><span style={{ fontStyle: 'italic' }}>Exento</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: '#475569' }}>
                <span>IVA (19%)</span>
                <span>{sym} {fmtNum(Number(quote.tax_amount), cur)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: 6, background: '#1e293b', color: 'white', borderRadius: 6, fontSize: 14, fontWeight: 700 }}>
              <span>TOTAL</span>
              <span>{sym} {fmtNum(Number(quote.total), cur)} {cur}</span>
            </div>
          </div>
        </div>

        {/* Notas */}
        {quote.notes && (
          <div style={{ margin: '0 36px 28px', padding: '14px 16px', background: '#f8fafc', borderRadius: 6, borderLeft: '3px solid #cbd5e1' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Notas</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>{quote.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '14px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{issuer.name} · {issuer.rut} · {issuer.website}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{quote.quote_number}</div>
        </div>
      </div>
    </div>
  )
}