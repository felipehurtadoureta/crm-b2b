// Gestor de documentos de empresa: tabla `company_documents` + bucket Storage `company-documents`.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cfInvoicesQueryKey } from '@/hooks/useCommercialFollowups'
import { companyDocumentsQueryOptions } from '@/lib/companyDocumentsQuery'
import { fetchInvoicesByCompany } from '@/lib/commercialFollowupsQuery'
import CompanyDocumentUploadZone from '@/components/documents/CompanyDocumentUploadZone'
import {
  COMPANY_DOCUMENTS_BUCKET,
  uploadCompanyDocumentFiles,
} from '@/lib/companyDocumentsUpload'
import { COMPANY_DOCUMENT_CATEGORY_LABEL } from '@/lib/companyDocumentsQuery'
import {
  resolveCompanyDocumentUploadTargets,
  type UploadDocumentTarget,
} from '@/lib/resolveCompanyDocumentUploadTargets'
import type { CompanyDocument, CompanyDocumentCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CommercialFollowupsDocumentSync } from '@/components/companies/CompanyCommercialFollowupsSection'
import { FileText, Trash2, Download, FolderOpen, Search } from 'lucide-react'

/** Estado enviado desde seguimiento comercial (ficha empresa) para alinear destino/cotización/factura. */
export type FollowupDocumentSyncState = CommercialFollowupsDocumentSync & { revision: number }

const FILTER_ALL = 'todos' as const
type CategoryFilter = typeof FILTER_ALL | CompanyDocumentCategory

export type { UploadDocumentTarget }

interface Props {
  companyId: string
  canEdit: boolean
  anchorId?: string
  /** En ficha empresa: zona de carga más baja y tabla más compacta. */
  density?: 'default' | 'compact'
  /** Cotizaciones de la empresa para asociar archivos al subir (opcional) */
  quotesForLink?: { id: string; quote_number: string; title?: string | null }[]
  /** Sincronía con pestaña/contexto del módulo de seguimiento comercial (misma empresa). */
  followupDocumentSync?: FollowupDocumentSyncState | null
}

export default function CompanyDocumentsSection({
  companyId,
  canEdit,
  anchorId,
  density = 'default',
  quotesForLink,
  followupDocumentSync = null,
}: Props) {
  const queryClient = useQueryClient()

  const [defaultCategory, setDefaultCategory] = useState<CompanyDocumentCategory>('contrato')
  const [uploadDestino, setUploadDestino] = useState<UploadDocumentTarget>('general')
  const [uploadQuoteId, setUploadQuoteId] = useState('')
  const [uploadInvoiceId, setUploadInvoiceId] = useState('')
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>(FILTER_ALL)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null)

  const docsQuery = useQuery(companyDocumentsQueryOptions(companyId))

  const invoicesQuery = useQuery({
    queryKey: cfInvoicesQueryKey(companyId),
    queryFn: () => fetchInvoicesByCompany(companyId),
    enabled: Boolean(companyId),
  })

  const uploadMutation = useMutation({
    mutationFn: (payload: { files: File[]; quoteId: string | null; invoiceId: string | null }) =>
      uploadCompanyDocumentFiles(payload.files, companyId, defaultCategory, payload.quoteId, payload.invoiceId),
    onSuccess: (res, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] })
      if (vars.quoteId) {
        void queryClient.invalidateQueries({ queryKey: ['company-documents-by-quote', vars.quoteId] })
      }
      if (vars.invoiceId) {
        void queryClient.invalidateQueries({ queryKey: ['company-documents-by-invoice', vars.invoiceId] })
      }
      const parts: string[] = []
      if (res.uploaded > 0) parts.push(`${res.uploaded} archivo(s) cargado(s).`)
      if (res.failures.length > 0) {
        parts.push(
          `${res.failures.length} con error: ${res.failures.map(f => `${f.name} (${f.reason})`).join('; ')}`,
        )
      }
      const text = parts.join(' ').trim() || 'No se pudo completar la carga.'
      setNotice({
        type: res.uploaded > 0 && res.failures.length === 0 ? 'ok' : 'warn',
        text,
      })
      window.setTimeout(() => setNotice(null), 8000)
    },
    onError: (e: Error) => {
      setNotice({ type: 'warn', text: e.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (doc: CompanyDocument) => {
      await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([doc.storage_path])
      const { error } = await supabase.from('company_documents').delete().eq('id', doc.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_, doc) => {
      void queryClient.invalidateQueries({ queryKey: ['company-documents', companyId] })
      if (doc.quote_id) {
        void queryClient.invalidateQueries({ queryKey: ['company-documents-by-quote', doc.quote_id] })
      }
      if (doc.invoice_id) {
        void queryClient.invalidateQueries({ queryKey: ['company-documents-by-invoice', doc.invoice_id] })
      }
    },
  })

  const rows = docsQuery.data ?? []

  const facturasLista = invoicesQuery.data ?? []

  useEffect(() => {
    if (uploadDestino === 'quote' && (!quotesForLink || quotesForLink.length === 0)) setUploadDestino('general')
  }, [uploadDestino, quotesForLink])

  useEffect(() => {
    if (uploadDestino === 'invoice' && facturasLista.length === 0) setUploadDestino('general')
  }, [uploadDestino, facturasLista.length])

  /** Precarga primera cotización / factura al elegir ese destino de subida. */
  useEffect(() => {
    if (uploadDestino !== 'quote' || !quotesForLink?.length) return
    const seleccionOk = Boolean(uploadQuoteId && quotesForLink.some(q => q.id === uploadQuoteId))
    if (!seleccionOk) setUploadQuoteId(quotesForLink[0].id)
  }, [uploadDestino, quotesForLink, uploadQuoteId])

  useEffect(() => {
    if (uploadDestino !== 'invoice' || facturasLista.length === 0) return
    const seleccionOk = Boolean(uploadInvoiceId && facturasLista.some(i => i.id === uploadInvoiceId))
    if (!seleccionOk) setUploadInvoiceId(facturasLista[0].id)
  }, [uploadDestino, facturasLista, uploadInvoiceId])

  // Alinear subida con la pestaña y los selectores del seguimiento comercial en la misma empresa
  useEffect(() => {
    if (!followupDocumentSync) return
    const { destino, quoteId: qid, invoiceId: invId } = followupDocumentSync
    setUploadDestino(destino)
    if (destino === 'general') {
      setUploadQuoteId('')
      setUploadInvoiceId('')
      return
    }
    if (destino === 'quote') {
      setUploadInvoiceId('')
      if (qid) setUploadQuoteId(qid)
      return
    }
    setUploadQuoteId('')
    if (invId) setUploadInvoiceId(invId)
  }, [followupDocumentSync?.revision])

  const quoteLabel = useCallback(
    (doc: CompanyDocument) => {
      if (!doc.quote_id) return ''
      const r = quotesForLink?.find(x => x.id === doc.quote_id)
      if (r) return `${r.quote_number}${r.title ? ` — ${r.title}` : ''}`
      return doc.quote_id
    },
    [quotesForLink],
  )

  const invoiceLabel = useCallback(
    (doc: CompanyDocument) => {
      if (!doc.invoice_id) return ''
      const inv = facturasLista.find(x => x.id === doc.invoice_id)
      if (inv) return inv.invoice_number
      return doc.invoice_id
    },
    [facturasLista],
  )

  const showQuoteColumn = Boolean((quotesForLink?.length ?? 0) > 0 || rows.some(d => d.quote_id))
  const showInvoiceColumn = Boolean(facturasLista.length > 0 || rows.some(d => d.invoice_id))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(d => {
      if (filterCategory !== FILTER_ALL && d.category !== filterCategory) return false
      if (!q) return true
      const qn = quoteLabel(d).toLowerCase()
      const invn = invoiceLabel(d).toLowerCase()
      return (
        d.file_name.toLowerCase().includes(q) ||
        (d.notes ?? '').toLowerCase().includes(q) ||
        (qn && qn.includes(q)) ||
        (invn && invn.includes(q))
      )
    })
  }, [rows, filterCategory, search, quoteLabel, invoiceLabel])

  const runUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      const resolved = resolveCompanyDocumentUploadTargets({
        destino: uploadDestino,
        quoteId: uploadQuoteId,
        invoiceId: uploadInvoiceId,
        invoices: facturasLista,
      })
      if (resolved.error) {
        setNotice({ type: 'warn', text: resolved.error })
        window.setTimeout(() => setNotice(null), 6000)
        return
      }
      uploadMutation.mutate({
        files,
        quoteId: resolved.quoteId,
        invoiceId: resolved.invoiceId,
      })
    },
    [uploadMutation, uploadDestino, uploadQuoteId, uploadInvoiceId, facturasLista],
  )

  const onDownload = async (doc: CompanyDocument) => {
    const { data, error: sErr } = await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 3600)
    if (sErr || !data?.signedUrl) {
      setNotice({ type: 'warn', text: sErr?.message ?? 'No se pudo generar el enlace de descarga.' })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const onDelete = (doc: CompanyDocument) => {
    if (!canEdit) return
    if (!window.confirm(`¿Eliminar «${doc.file_name}»?`)) return
    deleteMutation.mutate(doc, {
      onError: (e: Error) => setNotice({ type: 'warn', text: e.message }),
    })
  }

  const errMsg = docsQuery.error instanceof Error ? docsQuery.error.message : null
  const compact = density === 'compact'

  return (
    <section
      {...(anchorId ? { id: anchorId } : {})}
      className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-6"
    >
      <div className={cn('px-4 border-b bg-slate-50 flex flex-col gap-1', compact ? 'py-2' : 'py-3')}>
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <FolderOpen size={16} className="text-gray-400" />
          Gestor de documentos
        </h2>
        {!compact && (
          <p className="text-[11px] text-gray-500">
            Contratos, órdenes de compra y adjuntos. Indique antes de cargar si el archivo es{' '}
            <span className="font-medium text-gray-700">general de la empresa</span>, ligado a una{' '}
            <span className="font-medium text-gray-700">cotización</span> o a una <span className="font-medium text-gray-700">factura</span>.
          </p>
        )}
      </div>

      {canEdit && (
        <CompanyDocumentUploadZone
          className="mx-3 mt-2 mb-0 px-3 py-2"
          density={compact ? 'compact' : 'default'}
          isUploading={uploadMutation.isPending}
          onFiles={runUpload}
          controls={
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 min-w-0 [scrollbar-width:thin]">
            <label className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-gray-500 whitespace-nowrap">Destino</span>
              <select
                value={uploadDestino}
                onChange={e => setUploadDestino(e.target.value as UploadDocumentTarget)}
                className="text-xs border rounded-md px-2 py-1 bg-white text-gray-800 min-w-[9.5rem] max-w-[12rem]"
                title="Dónde se asocian los archivos que suba"
              >
                <option value="general">Empresa (general)</option>
                <option value="quote" disabled={!quotesForLink || quotesForLink.length === 0}>
                  Cotización
                </option>
                <option value="invoice" disabled={facturasLista.length === 0}>
                  Factura
                </option>
              </select>
            </label>
            {uploadDestino === 'quote' && quotesForLink && quotesForLink.length > 0 && (
              <label className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-gray-500 whitespace-nowrap">Cotización</span>
                <select
                  value={uploadQuoteId}
                  onChange={e => setUploadQuoteId(e.target.value)}
                  className="text-xs border rounded-md px-2 py-1 bg-white text-gray-800 min-w-[7rem] max-w-[13rem]"
                >
                  {quotesForLink.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quote_number}
                      {q.title ? ` — ${q.title}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {uploadDestino === 'invoice' && facturasLista.length > 0 && (
              <label className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-gray-500 whitespace-nowrap">Factura</span>
                <select
                  value={uploadInvoiceId}
                  onChange={e => setUploadInvoiceId(e.target.value)}
                  className="text-xs border rounded-md px-2 py-1 bg-white text-gray-800 min-w-[7rem] max-w-[13rem]"
                >
                  {facturasLista.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
              <span className="text-[10px] text-gray-500 whitespace-nowrap">Categoría</span>
              <select
                value={defaultCategory}
                onChange={e => setDefaultCategory(e.target.value as CompanyDocumentCategory)}
                className="text-xs border rounded-md px-2 py-1 bg-white text-gray-800 min-w-[5.75rem]"
                title="Categoría por defecto al subir"
              >
                {(Object.keys(COMPANY_DOCUMENT_CATEGORY_LABEL) as CompanyDocumentCategory[]).map(k => (
                  <option key={k} value={k}>
                    {COMPANY_DOCUMENT_CATEGORY_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          }
        />
      )}

      <div className={cn('p-3 space-y-3', !compact && 'sm:space-y-3.5')}>
        {notice && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-sm',
              notice.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900',
            )}
          >
            {notice.text}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar por nombre…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 pl-8 text-sm"
              aria-label="Buscar documentos"
            />
          </div>
          <label className="text-xs text-gray-600 flex items-center gap-1.5 shrink-0">
            <span className="text-gray-500">Mostrar</span>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as CategoryFilter)}
              className="text-xs border rounded-md px-2 py-1.5 bg-white text-gray-800"
            >
              <option value={FILTER_ALL}>Todas las categorías</option>
              {(Object.keys(COMPANY_DOCUMENT_CATEGORY_LABEL) as CompanyDocumentCategory[]).map(k => (
                <option key={k} value={k}>
                  {COMPANY_DOCUMENT_CATEGORY_LABEL[k]}
                </option>
              ))}
            </select>
            <span className="text-gray-400 tabular-nums">({filtered.length})</span>
          </label>
        </div>

        {docsQuery.isLoading && <p className="text-sm text-gray-400">Cargando documentos…</p>}
        {docsQuery.isError && errMsg && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{errMsg}</div>
        )}

        {!docsQuery.isLoading && !docsQuery.isError && filtered.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-100 rounded-lg bg-gray-50/50">
            {rows.length === 0
              ? 'No hay documentos. Use el área superior para cargar el primero.'
              : 'Ningún documento coincide con el filtro o la búsqueda.'}
          </p>
        )}

        {!docsQuery.isLoading && !docsQuery.isError && filtered.length > 0 && (
          <div className="rounded-lg border border-gray-100 overflow-hidden">
            <div
              className={cn(
                'overflow-x-auto overflow-y-auto overscroll-contain',
                compact ? 'max-h-[min(12rem,38vh)]' : 'max-h-[min(16rem,48vh)]',
              )}
            >
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-[1] border-b border-gray-200">
                  <tr>
                    <th className="text-left font-medium text-gray-600 px-3 py-2.5 text-xs">Documento</th>
                    <th className="text-left font-medium text-gray-600 px-3 py-2.5 text-xs w-[8.5rem]">Categoría</th>
                    {showQuoteColumn && (
                      <th className="text-left font-medium text-gray-600 px-3 py-2.5 text-xs min-w-[7rem] max-w-[12rem]">
                        Cotización
                      </th>
                    )}
                    {showInvoiceColumn && (
                      <th className="text-left font-medium text-gray-600 px-3 py-2.5 text-xs min-w-[7rem] max-w-[12rem]">
                        Factura
                      </th>
                    )}
                    <th className="text-left font-medium text-gray-600 px-3 py-2.5 text-xs w-[9rem]">Fecha</th>
                    <th className="text-right font-medium text-gray-600 px-3 py-2.5 text-xs w-[11rem]">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(doc => (
                    <tr key={doc.id} className="hover:bg-gray-50/80">
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-start gap-2 min-w-0">
                          <FileText size={16} className="text-gray-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate max-w-[14rem] sm:max-w-xs md:max-w-md">
                              {doc.file_name}
                            </p>
                            {doc.notes && (
                              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{doc.notes}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-gray-700 text-xs whitespace-nowrap">
                        {COMPANY_DOCUMENT_CATEGORY_LABEL[doc.category]}
                      </td>
                      {showQuoteColumn && (
                        <td className="px-3 py-2.5 align-top text-gray-600 text-xs max-w-[12rem]">
                          {doc.quote_id ? (
                            <span className="line-clamp-2 font-mono text-[11px]" title={quoteLabel(doc)}>
                              {quoteLabel(doc)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      {showInvoiceColumn && (
                        <td className="px-3 py-2.5 align-top text-gray-600 text-xs max-w-[12rem]">
                          {doc.invoice_id ? (
                            <span className="line-clamp-2 font-mono text-[11px]" title={invoiceLabel(doc)}>
                              {invoiceLabel(doc)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2.5 align-top text-gray-500 text-xs whitespace-nowrap">
                        {new Date(doc.created_at).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => void onDownload(doc)}
                        >
                          <Download size={14} className="mr-1" />
                          Descargar
                        </Button>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-red-600 hover:text-red-700"
                            disabled={deleteMutation.isPending}
                            onClick={() => onDelete(doc)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
