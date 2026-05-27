import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { siiDteTypeLabel } from '@/lib/siiDocumentsQuery'
import {
  fetchSiiDocIdsLinkedToOtherQuotes,
  fetchSiiSalesInvoicesForQuoteLink,
  linkQuoteToSiiSalesInvoice,
  relinkQuoteToSiiSalesInvoice,
} from '@/lib/quoteInvoiceSiiLink'
import { normalizeQuoteStage } from '@/types'
import { supabase } from '@/lib/supabase'
import { ExternalLink, Loader2 } from 'lucide-react'

const SELECT_IN_MODAL = 'z-[200] max-h-60 overflow-y-auto'

interface Props {
  open: boolean
  quoteId: string
  companyId: string
  quoteNumber: string
  quoteTotal: number
  quoteCurrency: string
  /** Primera vinculación o corrección de factura ya asignada */
  intent?: 'link' | 'replace'
  onClose: () => void
  onCompleted: () => void
}

function fmtMoney(amount: number, currency: string) {
  if (currency === 'CLP') {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(amount)
  }
  if (currency === 'USD') {
    return `US$ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
  }
  return `${amount} ${currency}`
}

/** Modal para vincular factura SII al facturar una cotización. */
export default function QuoteInvoiceValidationDialog({
  open,
  quoteId,
  companyId,
  quoteNumber,
  quoteTotal,
  quoteCurrency,
  intent = 'link',
  onClose,
  onCompleted,
}: Props) {
  const isReplace = intent === 'replace'
  const [pickerMode, setPickerMode] = useState<'select' | 'folio'>('select')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [folioInput, setFolioInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const docsQuery = useQuery({
    queryKey: ['quote-sii-invoices', companyId],
    queryFn: () => fetchSiiSalesInvoicesForQuoteLink(companyId),
    enabled: open && !!companyId,
  })

  const blockedQuery = useQuery({
    queryKey: ['quote-sii-invoices-blocked', companyId, quoteId],
    queryFn: () => fetchSiiDocIdsLinkedToOtherQuotes(companyId, quoteId),
    enabled: open && !!companyId,
  })

  const availableDocs = useMemo(() => {
    const blocked = blockedQuery.data ?? new Set<string>()
    return (docsQuery.data ?? []).filter(d => !blocked.has(d.id))
  }, [docsQuery.data, blockedQuery.data])

  useEffect(() => {
    if (!open) return
    setPickerMode('select')
    setSelectedDocId('')
    setFolioInput('')
    setError(null)
    setSaving(false)
  }, [open, quoteId])

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      const { data: quoteRow, error: qErr } = await supabase
        .from('quotes')
        .select('stage')
        .eq('id', quoteId)
        .single()
      if (qErr) throw new Error(qErr.message)

      const previousStage = normalizeQuoteStage(
        (quoteRow?.stage as string | undefined) ?? 'pendiente_facturar',
      )

      const payload = {
        quoteId,
        companyId,
        quoteTotal,
        quoteCurrency,
        previousStage,
        siiSalesDocumentId: pickerMode === 'select' ? selectedDocId || undefined : undefined,
        folio: pickerMode === 'folio' ? folioInput : undefined,
      }
      if (isReplace) await relinkQuoteToSiiSalesInvoice(payload)
      else await linkQuoteToSiiSalesInvoice(payload)
      onCompleted()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const canSubmit =
    !saving &&
    !docsQuery.isLoading &&
    (pickerMode === 'select' ? !!selectedDocId : !!folioInput.trim())

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isReplace ? 'Cambiar factura SII' : 'Vincular factura SII'}</DialogTitle>
          <DialogDescription>
            Cotización <span className="font-medium text-gray-800">{quoteNumber}</span>
            {' · '}
            {fmtMoney(quoteTotal, quoteCurrency)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-xs text-gray-600 leading-relaxed">
            {isReplace
              ? 'Seleccione la factura SII correcta. Se actualizará el vínculo de esta cotización.'
              : 'Emita la factura en el portal del SII. Luego seleccione o ingrese el folio correspondiente para vincularla y marcar la cotización como facturada.'}
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={pickerMode === 'select' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setPickerMode('select')}
            >
              Elegir de SII
            </Button>
            <Button
              type="button"
              size="sm"
              variant={pickerMode === 'folio' ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setPickerMode('folio')}
            >
              Ingresar folio
            </Button>
          </div>

          {pickerMode === 'select' ? (
            <div className="space-y-1.5">
              <Label htmlFor="sii-invoice-select" className="text-xs">
                Factura SII de la empresa
              </Label>
              {docsQuery.isLoading ? (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando facturas…
                </p>
              ) : docsQuery.isError ? (
                <p className="text-xs text-red-600">{(docsQuery.error as Error).message}</p>
              ) : availableDocs.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  No hay facturas SII disponibles para esta empresa.
                  {' '}
                  <Link to="/sii" className="inline-flex items-center gap-0.5 font-medium underline">
                    Importar en SII
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                  <SelectTrigger id="sii-invoice-select" className="h-9 text-sm">
                    <SelectValue placeholder="Seleccione factura…" />
                  </SelectTrigger>
                  <SelectContent className={SELECT_IN_MODAL}>
                    {availableDocs.map(doc => (
                      <SelectItem key={doc.id} value={doc.id}>
                        {siiDteTypeLabel(doc.tipo_dte)} {doc.folio}
                        {doc.fecha_emision ? ` · ${doc.fecha_emision.slice(0, 10)}` : ''}
                        {doc.monto_total != null
                          ? ` · ${fmtMoney(Number(doc.monto_total), 'CLP')}`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="sii-folio-input" className="text-xs">
                Número de factura (folio SII)
              </Label>
              <Input
                id="sii-folio-input"
                value={folioInput}
                onChange={e => setFolioInput(e.target.value)}
                placeholder="Ej. 12345"
                className="h-9 text-sm"
                autoComplete="off"
              />
              <p className="text-[11px] text-gray-500">
                Debe coincidir con una factura importada en SII → Ventas para esta empresa.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 rounded-md border border-red-200 bg-red-50 px-2.5 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Vinculando…
              </>
            ) : (
              isReplace ? 'Guardar factura SII' : 'Vincular y facturar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
