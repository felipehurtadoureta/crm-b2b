import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { INVOICE_STATUS_VALIDATE_OPTIONS } from '@/lib/invoiceDisplay'
import {
  completeQuoteInvoicing,
  completeQuoteInvoicingWithoutStock,
  fetchQuoteStockLinesForInvoicing,
  type InvoiceStockLineInput,
} from '@/lib/quoteInvoiceFulfillment'
import { validateCompanyDocumentFile } from '@/lib/companyDocumentsUpload'
import type { InvoiceStatus } from '@/types'
import { FileText, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  quoteId: string
  companyId: string
  quoteNumber: string
  quoteTotal: number
  quoteCurrency: string
  onClose: () => void
  onCompleted: () => void
}

type LineFormState = {
  selectedIds: string[]
  installedAddress: string
  destinationNotes: string
}

export default function QuoteInvoiceValidationDialog({
  open,
  quoteId,
  companyId,
  quoteNumber,
  quoteTotal,
  quoteCurrency,
  onClose,
  onCompleted,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('pendiente')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [lineForms, setLineForms] = useState<Record<string, LineFormState>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stockQ = useQuery({
    queryKey: ['quote-invoice-stock-lines', quoteId],
    queryFn: () => fetchQuoteStockLinesForInvoicing(quoteId),
    enabled: open && Boolean(quoteId),
  })

  useEffect(() => {
    if (!open || !stockQ.data) return
    const next: Record<string, LineFormState> = {}
    for (const line of stockQ.data) {
      const pre = line.assignedIds.slice(0, line.quantity)
      next[line.quoteItemId] = {
        selectedIds: pre.length === line.quantity ? pre : [...line.assignedIds],
        installedAddress: '',
        destinationNotes: '',
      }
    }
    setLineForms(next)
  }, [open, stockQ.data])

  useEffect(() => {
    if (!open) {
      setInvoiceNumber('')
      setInvoiceStatus('pendiente')
      setPdfFile(null)
      setError(null)
      setLineForms({})
    }
  }, [open])

  const toggleSerial = useCallback((quoteItemId: string, invId: string, maxQty: number) => {
    setLineForms(prev => {
      const cur = prev[quoteItemId] ?? { selectedIds: [], installedAddress: '', destinationNotes: '' }
      const has = cur.selectedIds.includes(invId)
      let nextIds: string[]
      if (has) {
        nextIds = cur.selectedIds.filter(id => id !== invId)
      } else if (cur.selectedIds.length >= maxQty) {
        nextIds = cur.selectedIds
      } else {
        nextIds = [...cur.selectedIds, invId]
      }
      return { ...prev, [quoteItemId]: { ...cur, selectedIds: nextIds } }
    })
  }, [])

  const handleSubmit = async () => {
    setError(null)
    if (!invoiceNumber.trim()) {
      setError('Ingrese el número de factura emitido por el SII.')
      return
    }
    if (!pdfFile) {
      setError('Suba el PDF de la factura.')
      return
    }
    const pdfErr = validateCompanyDocumentFile(pdfFile)
    if (pdfErr) {
      setError(pdfErr)
      return
    }

    const stockLines: InvoiceStockLineInput[] = (stockQ.data ?? []).map(line => {
      const f = lineForms[line.quoteItemId]
      return {
        quoteItemId: line.quoteItemId,
        inventoryItemIds: f?.selectedIds ?? [],
        installedAddress: f?.installedAddress,
        destinationNotes: f?.destinationNotes,
      }
    })

    setSaving(true)
    try {
      const payload = {
        quoteId,
        companyId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceStatus,
        quoteTotal,
        quoteCurrency,
        pdfFile,
        stockLines,
      }
      if ((stockQ.data ?? []).length === 0) {
        await completeQuoteInvoicingWithoutStock(payload)
      } else {
        await completeQuoteInvoicing(payload)
      }
      onCompleted()
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'No se pudo validar la factura.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const lines = stockQ.data ?? []

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Validar factura</h2>
            <p className="text-xs text-gray-500 mt-0.5">{quoteNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Cerrar">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <p className="text-xs text-gray-600 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
            Registre el folio del SII, el estado de pago y el PDF. Si hay stock propio, indique las series vendidas y su ubicación (pueden diferir de las reservadas en la cotización).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Número factura SII *</Label>
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Ej: 12345" className="font-mono text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado de la factura</Label>
              <Select value={invoiceStatus} onValueChange={v => setInvoiceStatus(v as InvoiceStatus)}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_STATUS_VALIDATE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-gray-500">Total cotización: {quoteTotal.toLocaleString('es-CL')} {quoteCurrency}</p>
          <div className="space-y-1">
            <Label className="text-xs">PDF de la factura *</Label>
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 cursor-pointer hover:bg-gray-50 text-sm text-gray-600">
              <FileText size={18} className="text-violet-600 shrink-0" />
              <span className="truncate">{pdfFile ? pdfFile.name : 'Seleccionar archivo PDF…'}</span>
              <input type="file" accept=".pdf,application/pdf" className="sr-only" onChange={e => setPdfFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {stockQ.isLoading && <p className="text-xs text-gray-400">Cargando líneas de stock…</p>}
          {stockQ.isError && <p className="text-xs text-red-600">{(stockQ.error as Error).message}</p>}
          {lines.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-gray-700">Series vendidas (stock propio)</p>
              {lines.map(line => {
                const f = lineForms[line.quoteItemId] ?? { selectedIds: [], installedAddress: '', destinationNotes: '' }
                const picked = f.selectedIds.length
                return (
                  <div key={line.quoteItemId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">{line.productName}</span>
                      <span className={`text-xs ${picked === line.quantity ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {picked} / {line.quantity} serie(s)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {line.options.map(opt => {
                        const on = f.selectedIds.includes(opt.id)
                        const full = !on && f.selectedIds.length >= line.quantity
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={full}
                            onClick={() => toggleSerial(line.quoteItemId, opt.id, line.quantity)}
                            className={`text-xs font-mono px-2 py-1 rounded-md border transition-colors ${
                              on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300 disabled:opacity-40'
                            }`}
                            title={opt.status === 'reservado' ? 'Reservado en cotización' : 'Disponible'}
                          >
                            {opt.serial_number}
                          </button>
                        )
                      })}
                    </div>
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      <Input placeholder="Dirección de instalación (opcional)" className="h-8 text-xs" value={f.installedAddress}
                        onChange={e => setLineForms(p => ({ ...p, [line.quoteItemId]: { ...f, installedAddress: e.target.value } }))} />
                      <Textarea placeholder="¿Dónde quedó el equipo? (opcional)" rows={2} className="text-xs" value={f.destinationNotes}
                        onChange={e => setLineForms(p => ({ ...p, [line.quoteItemId]: { ...f, destinationNotes: e.target.value } }))} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin mr-1" /> Guardando…</> : 'Validar y facturar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

