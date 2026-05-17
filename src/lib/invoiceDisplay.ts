import type { InvoiceStatus } from '@/types'

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  borrador: 'Borrador',
  pendiente: 'No pagada',
  pagada: 'Pagada',
  anulada: 'Anulada',
  nota_credito: 'Nota de crédito',
}

/** Estados que el usuario puede elegir al validar factura desde cotización. */
export const INVOICE_STATUS_VALIDATE_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'pendiente', label: 'No pagada' },
  { value: 'pagada', label: 'Pagada' },
  { value: 'nota_credito', label: 'Nota de crédito' },
]
