/**
 * Borrador del modal de factura por cotización (persiste al cerrar el modal sin facturar).
 */
import type { InvoiceStatus } from '@/types'

export interface InvoiceFormDraft {
  invoiceNumber: string
  glosa: string
  glosaFromQuote: string
  invoiceStatus: InvoiceStatus
  notes: string
  pdfFile: File | null
}

const cache = new Map<string, InvoiceFormDraft>()

export function getInvoiceFormDraft(quoteId: string): InvoiceFormDraft | undefined {
  return cache.get(quoteId)
}

export function setInvoiceFormDraft(quoteId: string, draft: InvoiceFormDraft): void {
  cache.set(quoteId, draft)
}

export function clearInvoiceFormDraft(quoteId: string): void {
  cache.delete(quoteId)
}
