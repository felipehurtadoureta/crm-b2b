import InvoiceFormDialog from '@/components/invoices/InvoiceFormDialog'

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

/** Modal de validación al facturar una cotización. */
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
  return (
    <InvoiceFormDialog
      open={open}
      mode="create-from-quote"
      quoteId={quoteId}
      companyId={companyId}
      quoteNumber={quoteNumber}
      quoteTotal={quoteTotal}
      quoteCurrency={quoteCurrency}
      onClose={onClose}
      onCompleted={onCompleted}
    />
  )
}
