/**
 * Subida de archivos a Storage + fila en company_documents (compartido por ficha empresa y cotización).
 */
import { supabase } from '@/lib/supabase'
import type { CompanyDocumentCategory } from '@/types'

export const COMPANY_DOCUMENTS_BUCKET = 'company-documents'

export const MAX_COMPANY_DOCUMENT_BYTES = 10 * 1024 * 1024

export const COMPANY_DOCUMENT_ACCEPT_INPUT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv'

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'txt',
  'csv',
])

const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/csv',
]

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Nombre seguro para claves de Supabase Storage (solo ASCII: letras, números, punto, guión, guión bajo). */
export function safeCompanyDocumentFileName(name: string) {
  const trimmed = name.trim() || 'documento'
  const dot = trimmed.lastIndexOf('.')
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const stem = trimmed.slice(0, dot > 0 ? dot : trimmed.length)
  const asciiStem = stem
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 120) || 'documento'
  return ext ? `${asciiStem}.${ext}` : asciiStem
}

/** PostgREST aún no expone `invoice_id` (migración pendiente). */
export function isMissingInvoiceIdColumnError(message: string | undefined, code?: string): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('invoice_id') &&
    (m.includes('schema cache') ||
      m.includes('could not find') ||
      m.includes('column') ||
      m.includes('does not exist'))
  )
}

/** Cotización vinculada a la factura (para asociar el PDF si falta columna `invoice_id`). */
async function resolveQuoteIdForDocumentLink(
  quoteId: string | null,
  invoiceId: string | null,
): Promise<string | null> {
  const direct = quoteId?.trim()
  if (direct) return direct
  if (!invoiceId?.trim()) return null
  const { data, error } = await supabase
    .from('invoices')
    .select('quote_id')
    .eq('id', invoiceId.trim())
    .maybeSingle()
  if (error) return null
  return (data?.quote_id as string | null)?.trim() || null
}

type CompanyDocumentInsertRow = {
  company_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  category: CompanyDocumentCategory
  uploaded_by: string | null
  quote_id?: string
  invoice_id?: string
}

export function validateCompanyDocumentFile(file: File): string | null {
  if (file.size <= 0) return 'El archivo está vacío.'
  if (file.size > MAX_COMPANY_DOCUMENT_BYTES) {
    return `Supera el máximo de ${MAX_COMPANY_DOCUMENT_BYTES / (1024 * 1024)} MB.`
  }
  const ext = fileExtension(file.name)
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return `Tipo no permitido. Use: ${[...ALLOWED_EXTENSIONS].sort().join(', ')}.`
  }
  if (file.type && file.type !== 'application/octet-stream') {
    const mimeOk = ALLOWED_MIME_PREFIXES.some(p => file.type.startsWith(p) || file.type === p)
    if (!mimeOk) {
      return `Tipo MIME no permitido (${file.type}).`
    }
  }
  return null
}

export interface UploadCompanyDocumentsResult {
  uploaded: number
  failures: { name: string; reason: string }[]
}

/**
 * Sube archivos al bucket y crea filas.
 * `quoteId` o `invoiceId` (solo uno): asocia cada documento; ambos null = documento general de la empresa.
 */
export async function uploadCompanyDocumentFiles(
  files: File[],
  companyId: string,
  category: CompanyDocumentCategory,
  quoteId: string | null,
  invoiceId: string | null = null,
): Promise<UploadCompanyDocumentsResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id ?? null

  const failures: { name: string; reason: string }[] = []
  let uploaded = 0
  const linkedQuoteId = await resolveQuoteIdForDocumentLink(quoteId, invoiceId)

  for (const file of files) {
    const validation = validateCompanyDocumentFile(file)
    if (validation) {
      failures.push({ name: file.name, reason: validation })
      continue
    }

    const uid = crypto.randomUUID()
    const path = `${companyId}/${uid}_${safeCompanyDocumentFileName(file.name)}`

    const { error: upErr } = await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })

    if (upErr) {
      const msg = upErr.message ?? ''
      failures.push({
        name: file.name,
        reason:
          msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')
            ? 'No existe el bucket "company-documents" en Storage. Ejecute supabase/sql/company_documents_storage.sql.'
            : msg || 'Error al subir.',
      })
      continue
    }

    const quoteForRow = invoiceId ? null : quoteId?.trim() || null
    const invoiceForRow = invoiceId?.trim() || null

    const row: CompanyDocumentInsertRow = {
      company_id: companyId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      category,
      uploaded_by: userId,
    }
    if (quoteForRow) row.quote_id = quoteForRow
    if (invoiceForRow) row.invoice_id = invoiceForRow

    let insErr = (await supabase.from('company_documents').insert(row)).error

    // Sin columna invoice_id en Supabase: asociar por quote_id de la factura o solo empresa.
    if (insErr && invoiceForRow && isMissingInvoiceIdColumnError(insErr.message, insErr.code)) {
      const base: CompanyDocumentInsertRow = {
        company_id: row.company_id,
        storage_path: row.storage_path,
        file_name: row.file_name,
        mime_type: row.mime_type,
        category: row.category,
        uploaded_by: row.uploaded_by,
      }
      if (linkedQuoteId) {
        insErr = (await supabase.from('company_documents').insert({ ...base, quote_id: linkedQuoteId })).error
      } else {
        insErr = (await supabase.from('company_documents').insert(base)).error
      }
    }

    if (insErr) {
      await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([path])
      let reason = insErr.message
      if (/quote_id|invoice_id|exclusive|quote_invoice/i.test(reason) || /schema cache/i.test(reason)) {
        reason =
          'Ejecute en Supabase SQL Editor: supabase/sql/company_documents_invoice_id.sql ' +
          '(y company_documents_quote_id.sql si aplica). Detalle: ' +
          String(insErr.message)
      }
      failures.push({ name: file.name, reason })
      continue
    }

    uploaded += 1
  }

  return { uploaded, failures }
}
