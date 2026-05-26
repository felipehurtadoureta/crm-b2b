import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VALIDATE_OPTIONS } from '@/lib/invoiceDisplay'
import { completeQuoteInvoicingWithoutStock } from '@/lib/quoteInvoiceFulfillment'
import { fetchQuoteInvoiceGlosaText } from '@/lib/quoteInvoiceGlosa'
import {
  updateInvoice,
  fetchInvoiceDocuments,
  deleteInvoice,
  type InvoiceListRow,
} from '@/lib/invoicesQuery'
import { uploadCompanyDocumentFiles, validateCompanyDocumentFile } from '@/lib/companyDocumentsUpload'
import type { InvoiceStatus } from '@/types'
import { Building2, FileText, Loader2, Trash2 } from 'lucide-react'

const SELECT_IN_MODAL = 'z-[200] max-h-60 overflow-y-auto'

export type InvoiceFormMode = 'create-from-quote' | 'edit'

interface CreateFromQuoteProps {
  mode: 'create-from-quote'
  quoteId: string
  companyId: string
  quoteNumber: string
  quoteTotal: number
  quoteCurrency: string
}

interface EditProps {
  mode: 'edit'
  invoice: InvoiceListRow
}

type Props = {
  open: boolean
  onClose: () => void
  onCompleted: () => void
  onDeleted?: () => void
  canDelete?: boolean
} & (CreateFromQuoteProps | EditProps)

const ALL_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'borrador', label: INVOICE_STATUS_LABEL.borrador },
  { value: 'pendiente', label: INVOICE_STATUS_LABEL.pendiente },
  { value: 'pagada', label: INVOICE_STATUS_LABEL.pagada },
  { value: 'anulada', label: INVOICE_STATUS_LABEL.anulada },
  { value: 'nota_credito', label: INVOICE_STATUS_LABEL.nota_credito },
]

export default function InvoiceFormDialog(props: Props) {
  const { open, onClose, onCompleted, onDeleted, canDelete = true, mode } = props

  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [glosa, setGlosa] = useState('')
  const [glosaFromQuote, setGlosaFromQuote] = useState('')
  const [loadingGlosa, setLoadingGlosa] = useState(false)
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('pendiente')
  const [notes, setNotes] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingPdfName, setExistingPdfName] = useState<string | null>(null)

  const isCreate = mode === 'create-from-quote'
  const subtitle = isCreate ? props.quoteNumber : props.invoice.invoice_number
  const companyId = isCreate ? props.companyId : props.invoice.company_id
  const companyName = !isCreate ? props.invoice.companies?.name : null

  useEffect(() => {
    if (!open) return
    setError(null)
    setPdfFile(null)
    setGlosaFromQuote('')

    if (mode === 'create-from-quote') {
      setInvoiceNumber('')
      setGlosa('')
      setInvoiceStatus('pendiente')
      setNotes('')
      setExistingPdfName(null)
      setLoadingGlosa(true)
      void fetchQuoteInvoiceGlosaText(props.quoteId)
        .then(text => {
          setGlosa(text)
          setGlosaFromQuote(text)
        })
        .catch(() => {
          setGlosa('')
          setGlosaFromQuote('')
        })
        .finally(() => setLoadingGlosa(false))
      return
    }

    const inv = props.invoice
    setInvoiceNumber(inv.invoice_number)
    setGlosa(inv.title?.trim() ?? '')
    setInvoiceStatus(inv.status)
    setNotes(inv.notes?.trim() ?? '')
    void fetchInvoiceDocuments(inv.id).then(docs => {
      const pdf = docs.find(d => d.file_name?.toLowerCase().endsWith('.pdf'))
      setExistingPdfName(pdf?.file_name ?? (docs[0]?.file_name ?? null))
    })
  }, [open, mode, props])

  const handleSubmit = async () => {
    setError(null)
    if (!invoiceNumber.trim()) {
      setError('Ingrese el número de factura emitido por el SII.')
      return
    }
    if (!glosa.trim()) {
      setError('Ingrese la glosa de la factura.')
      return
    }

    if (isCreate) {
      if (!pdfFile) {
        setError('Suba el PDF de la factura.')
        return
      }
      const pdfErr = validateCompanyDocumentFile(pdfFile)
      if (pdfErr) {
        setError(pdfErr)
        return
      }
    } else if (pdfFile) {
      const pdfErr = validateCompanyDocumentFile(pdfFile)
      if (pdfErr) {
        setError(pdfErr)
        return
      }
    }

    setSaving(true)
    try {
      if (isCreate) {
        await completeQuoteInvoicingWithoutStock({
          quoteId: props.quoteId,
          companyId: props.companyId,
          invoiceNumber: invoiceNumber.trim(),
          invoiceStatus,
          quoteTotal: props.quoteTotal,
          quoteCurrency: props.quoteCurrency,
          pdfFile: pdfFile!,
          glosa: glosa.trim(),
          notes: notes.trim() || null,
        })
      } else {
        const inv = props.invoice
        const paidAt =
          invoiceStatus === 'pagada'
            ? inv.paid_at ?? new Date().toISOString()
            : invoiceStatus === 'pendiente' || invoiceStatus === 'borrador'
              ? null
              : inv.paid_at

        await updateInvoice(inv.id, {
          invoice_number: invoiceNumber.trim(),
          title: glosa.trim(),
          status: invoiceStatus,
          notes: notes.trim() || null,
          paid_at: paidAt,
        })

        if (pdfFile) {
          const upload = await uploadCompanyDocumentFiles(
            [pdfFile],
            inv.company_id,
            'factura',
            inv.quote_id,
            inv.id,
          )
          if (upload.uploaded === 0) {
            const reason = upload.failures[0]?.reason ?? 'No se pudo subir el PDF.'
            throw new Error(reason)
          }
        }
      }
      onCompleted()
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'No se pudo guardar la factura.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (isCreate || !canDelete) return
    const inv = props.invoice
    if (
      !window.confirm(
        `¿Eliminar la factura ${inv.invoice_number}? Se borrará el PDF adjunto. La cotización vinculada no se modifica.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await deleteInvoice(inv.id)
      onDeleted?.()
      onCompleted()
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'No se pudo eliminar la factura.')
    } finally {
      setDeleting(false)
    }
  }

  const statusOptions = isCreate ? INVOICE_STATUS_VALIDATE_OPTIONS : ALL_STATUS_OPTIONS

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-2xl z-[100]"
        showCloseButton
      >
        <DialogHeader className="px-4 py-3 border-b border-gray-200 shrink-0 text-left">
          <DialogTitle className="text-sm font-semibold">
            {isCreate ? 'Validar factura' : 'Editar factura'}
          </DialogTitle>
          <DialogDescription className="text-xs space-y-1">
            <span className="block">{subtitle}</span>
            {isCreate && (
              <span className="block text-gray-500">
                Total cotización: {props.quoteTotal.toLocaleString('es-CL')} {props.quoteCurrency}
              </span>
            )}
            {!isCreate && companyId && (
              <Link
                to={`/companies/${companyId}/v2?cfTab=invoices`}
                className="inline-flex items-center gap-1 text-violet-700 hover:underline font-medium"
              >
                <Building2 size={12} />
                Ficha empresa{companyName ? `: ${companyName}` : ''}
              </Link>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {isCreate && (
            <p className="text-xs text-gray-600 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
              Registre folio SII, glosa (detalle de la cotización, editable), estado de pago y PDF.
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Número factura SII *</Label>
            <Input
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="Ej: 12345"
              className="font-mono text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Glosa (detalle) *</Label>
            <Textarea
              value={glosa}
              onChange={e => setGlosa(e.target.value)}
              rows={10}
              className="text-sm font-mono leading-relaxed"
              disabled={loadingGlosa}
              placeholder={loadingGlosa ? 'Cargando detalle de la cotización…' : 'Productos, descuentos, IVA y total'}
            />
            {isCreate && glosaFromQuote.trim() && glosa.trim() !== glosaFromQuote.trim() && (
              <button
                type="button"
                className="text-xs text-violet-700 hover:underline"
                onClick={() => setGlosa(glosaFromQuote)}
              >
                Restaurar detalle de la cotización
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Estado de la factura</Label>
              <Select value={invoiceStatus} onValueChange={v => setInvoiceStatus(v as InvoiceStatus)}>
                <SelectTrigger className="text-sm w-full"><SelectValue /></SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL}>
                  {statusOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isCreate && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Total</Label>
                <p className="text-sm font-medium pt-2">
                  {Number(props.invoice.total).toLocaleString('es-CL')} {props.invoice.currency}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notas internas (opcional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Observaciones internas, no necesariamente en el PDF"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">PDF de la factura {isCreate ? '*' : '(opcional, reemplaza el anterior)'}</Label>
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 cursor-pointer hover:bg-gray-50 text-sm text-gray-600">
              <FileText size={18} className="text-violet-600 shrink-0" />
              <span className="truncate">
                {pdfFile
                  ? pdfFile.name
                  : existingPdfName
                    ? `Actual: ${existingPdfName} — elegir nuevo PDF`
                    : 'Seleccionar archivo PDF…'}
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="px-4 py-3 shrink-0 sm:justify-between border-t border-gray-200 gap-2">
          {!isCreate && canDelete ? (
            <Button
              type="button"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => void handleDelete()}
              disabled={saving || deleting}
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin mr-1" />
              ) : (
                <Trash2 size={14} className="mr-1" />
              )}
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || deleting}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving || deleting || loadingGlosa}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1" />
                  Guardando…
                </>
              ) : isCreate ? (
                'Validar y facturar'
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
