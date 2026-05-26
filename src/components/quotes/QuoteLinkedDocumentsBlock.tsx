/**
 * Documentos asociados a una cotización (company_documents.quote_id): carga, lista y vista previa.
 * Estilo alineado a la ficha empresa v2.
 */
import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { companyDocumentsByQuoteQueryOptions, COMPANY_DOCUMENT_CATEGORY_LABEL } from '@/lib/companyDocumentsQuery'
import CompanyDocumentUploadZone from '@/components/documents/CompanyDocumentUploadZone'
import { COMPANY_DOCUMENTS_BUCKET, uploadCompanyDocumentFiles } from '@/lib/companyDocumentsUpload'
import type { CompanyDocument, CompanyDocumentCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Download, Eye, FileText, Paperclip, Trash2, X } from 'lucide-react'

function isImageMime(m: string | null, name: string) {
  if (m?.startsWith('image/')) return true
  return /\.(png|jpe?g|webp)$/i.test(name)
}

function isPdfMime(m: string | null, name: string) {
  if (m === 'application/pdf') return true
  return name.toLowerCase().endsWith('.pdf')
}

function isTextMime(m: string | null, name: string) {
  if (m?.startsWith('text/')) return true
  const lower = name.toLowerCase()
  return lower.endsWith('.txt') || lower.endsWith('.csv')
}

interface Props {
  quoteId: string
  companyId: string
  canEdit: boolean
}

export default function QuoteLinkedDocumentsBlock({ quoteId, companyId, canEdit }: Props) {
  const qc = useQueryClient()
  const [category, setCategory] = useState<CompanyDocumentCategory>('otro')
  const [notice, setNotice] = useState<string | null>(null)

  const [preview, setPreview] = useState<{ url: string; fileName: string; mime: string | null } | null>(null)

  const q = useQuery(companyDocumentsByQuoteQueryOptions(quoteId, true))

  const uploadMut = useMutation({
    mutationFn: (files: File[]) => uploadCompanyDocumentFiles(files, companyId, category, quoteId),
    onSuccess: res => {
      void qc.invalidateQueries({ queryKey: ['company-documents-by-quote', quoteId] })
      void qc.invalidateQueries({ queryKey: ['company-documents', companyId] })
      const parts: string[] = []
      if (res.uploaded > 0) parts.push(`${res.uploaded} archivo(s) cargado(s).`)
      if (res.failures.length > 0) {
        parts.push(res.failures.map(f => `${f.name}: ${f.reason}`).join(' · '))
      }
      setNotice(parts.join(' ') || null)
      window.setTimeout(() => setNotice(null), 6000)
    },
    onError: (e: Error) => setNotice(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (doc: CompanyDocument) => {
      await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([doc.storage_path])
      const { error } = await supabase.from('company_documents').delete().eq('id', doc.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company-documents-by-quote', quoteId] })
      void qc.invalidateQueries({ queryKey: ['company-documents', companyId] })
    },
  })

  const openPreview = async (doc: CompanyDocument) => {
    const { data, error } = await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 3600)
    if (error || !data?.signedUrl) {
      window.alert(error?.message ?? 'No se pudo generar la vista previa.')
      return
    }
    setPreview({ url: data.signedUrl, fileName: doc.file_name, mime: doc.mime_type })
  }

  const runUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0 || !canEdit) return
      uploadMut.mutate(files)
    },
    [canEdit, uploadMut],
  )

  const errMsg = q.error instanceof Error ? q.error.message : null

  return (
    <div
      id="quote-dialog-documentos"
      className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-8"
    >
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-start gap-2">
          <Paperclip size={16} className="text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800">Documentos de la cotización</h3>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              Archivos asociados solo a esta cotización. PDF e imágenes se pueden ver aquí; otros tipos se abren en una pestaña
              nueva sin descarga forzada.
            </p>
          </div>
        </div>
      </div>

      {canEdit && (
        <CompanyDocumentUploadZone
          className="mx-4 mt-3 mb-0 px-4 py-4"
          isUploading={uploadMut.isPending}
          onFiles={runUpload}
          buttonLabel="Elegir archivos"
          hint="Arrastre, pegue (Ctrl+V) o elija archivos — quedan en esta cotización"
          controls={
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <span className="text-gray-500">Categoría</span>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as CompanyDocumentCategory)}
                className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-800"
              >
                {(Object.keys(COMPANY_DOCUMENT_CATEGORY_LABEL) as CompanyDocumentCategory[]).map(k => (
                  <option key={k} value={k}>
                    {COMPANY_DOCUMENT_CATEGORY_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      )}

      <div className="p-4 space-y-3">
        {notice && <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">{notice}</div>}

        {q.isLoading && <p className="text-sm text-gray-400">Cargando…</p>}
        {q.isError && errMsg && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{errMsg}</p>
        )}
        {!q.isLoading && !q.isError && (q.data?.length ?? 0) === 0 && (
          <p className="text-sm text-gray-400 py-2">Sin archivos aún. {canEdit ? 'Use el área superior para cargar.' : ''}</p>
        )}
        {!q.isLoading && !q.isError && (q.data?.length ?? 0) > 0 && (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white">
            {q.data!.map(doc => (
              <li key={doc.id} className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="flex items-start gap-2 min-w-0">
                  <FileText size={16} className="text-gray-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {COMPANY_DOCUMENT_CATEGORY_LABEL[doc.category as CompanyDocumentCategory] ?? doc.category}
                      <span className="text-gray-300 mx-1">·</span>
                      {new Date(doc.created_at).toLocaleString('es-CL', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                    {doc.notes?.trim() ? <p className="text-xs text-gray-600 mt-1 line-clamp-2">{doc.notes}</p> : null}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-1 shrink-0">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void openPreview(doc)}>
                    <Eye size={14} className="mr-1" />
                    Ver
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={async () => {
                      const { data, error } = await supabase.storage
                        .from(COMPANY_DOCUMENTS_BUCKET)
                        .createSignedUrl(doc.storage_path, 3600)
                      if (error || !data?.signedUrl) {
                        window.alert(error?.message ?? 'No se pudo abrir el archivo.')
                        return
                      }
                      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <Download size={14} className="mr-1" />
                    Abrir
                  </Button>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-red-600"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar «${doc.file_name}»?`)) return
                        deleteMut.mutate(doc)
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b flex items-center justify-between gap-2 shrink-0">
              <p className="text-sm font-medium text-gray-900 truncate">{preview.fileName}</p>
              <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setPreview(null)} aria-label="Cerrar">
                <X size={18} />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-2 bg-gray-100 min-h-[200px]">
              {isPdfMime(preview.mime, preview.fileName) && <iframe title={preview.fileName} src={preview.url} className="w-full h-[min(70vh,600px)] rounded border border-gray-200 bg-white" />}
              {isImageMime(preview.mime, preview.fileName) && (
                <div className="flex justify-center p-2">
                  <img src={preview.url} alt={preview.fileName} className="max-w-full max-h-[min(70vh,600px)] object-contain rounded" />
                </div>
              )}
              {isTextMime(preview.mime, preview.fileName) && (
                <iframe title={preview.fileName} src={preview.url} className="w-full h-[min(70vh,600px)] rounded border border-gray-200 bg-white" />
              )}
              {!isPdfMime(preview.mime, preview.fileName) && !isImageMime(preview.mime, preview.fileName) && !isTextMime(preview.mime, preview.fileName) && (
                <div className="text-sm text-gray-600 p-6 text-center space-y-3">
                  <p>No hay vista previa integrada para este tipo de archivo.</p>
                  <Button type="button" onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}>
                    Abrir en pestaña nueva
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
