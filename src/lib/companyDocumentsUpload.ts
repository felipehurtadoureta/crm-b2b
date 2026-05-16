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

export function safeCompanyDocumentFileName(name: string) {
  return name.replace(/[^\w.\-()áéíóúñÁÉÍÓÚÑ ]+/g, '_').slice(0, 180)
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

    const row: {
      company_id: string
      storage_path: string
      file_name: string
      mime_type: string | null
      category: CompanyDocumentCategory
      uploaded_by: string | null
      quote_id?: string
      invoice_id?: string
    } = {
      company_id: companyId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      category,
      uploaded_by: userId,
    }
    if (quoteForRow) row.quote_id = quoteForRow
    if (invoiceForRow) row.invoice_id = invoiceForRow

    const { error: insErr } = await supabase.from('company_documents').insert(row)

    if (insErr) {
      await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([path])
      let reason = insErr.message
      if (/quote_id|invoice_id|exclusive|quote_invoice/i.test(reason) || /schema cache/i.test(reason)) {
        reason =
          'Revise migraciones: quote_id / invoice_id / restricción exclusiva en company_documents ' +
          '(ej. supabase/sql/company_documents_quote_id.sql y company_documents_invoice_id.sql). '
          + String(insErr.message)
      }
      failures.push({ name: file.name, reason })
      continue
    }

    uploaded += 1
  }

  return { uploaded, failures }
}
