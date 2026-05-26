/** Destino de asociación al subir documentos de empresa. */
export type UploadDocumentTarget = 'general' | 'quote' | 'invoice'

export interface ResolveUploadTargetsInput {
  destino: UploadDocumentTarget
  quoteId?: string
  invoiceId?: string
  invoices?: { id: string; quote_id?: string | null }[]
}

export interface ResolveUploadTargetsResult {
  quoteId: string | null
  invoiceId: string | null
  error?: string
}

/** Resuelve cotización/factura según el destino elegido antes de subir. */
export function resolveCompanyDocumentUploadTargets(
  input: ResolveUploadTargetsInput,
): ResolveUploadTargetsResult {
  const { destino, invoices = [] } = input

  if (destino === 'general') {
    return { quoteId: null, invoiceId: null }
  }

  if (destino === 'quote') {
    const quoteId = input.quoteId?.trim() || null
    if (!quoteId) {
      return {
        quoteId: null,
        invoiceId: null,
        error: 'Elija una cotización o cambie el destino a «Documentos generales».',
      }
    }
    return { quoteId, invoiceId: null }
  }

  const invoiceId = input.invoiceId?.trim() || null
  if (!invoiceId) {
    return {
      quoteId: null,
      invoiceId: null,
      error: 'Elija una factura o cambie el destino a «Documentos generales».',
    }
  }
  const inv = invoices.find(x => x.id === invoiceId)
  return {
    quoteId: inv?.quote_id?.trim() || null,
    invoiceId,
  }
}
