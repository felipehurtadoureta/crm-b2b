import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  allCompanyDocumentsQueryKey,
  allCompanyDocumentsQueryOptions,
  COMPANY_DOCUMENT_CATEGORY_LABEL,
  type CompanyDocumentListRow,
} from '@/lib/companyDocumentsQuery'
import { companyInvoiceFollowupHref } from '@/lib/invoicesQuery'
import CompanyDocumentUploadZone from '@/components/documents/CompanyDocumentUploadZone'
import {
  COMPANY_DOCUMENTS_BUCKET,
  uploadCompanyDocumentFiles,
} from '@/lib/companyDocumentsUpload'
import {
  resolveCompanyDocumentUploadTargets,
  type UploadDocumentTarget,
} from '@/lib/resolveCompanyDocumentUploadTargets'
import type { CompanyDocument, CompanyDocumentCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  Building2, Download, FileText, FolderOpen, Search, Trash2, Upload,
} from 'lucide-react'

const FILTER_ALL = 'todos' as const
type CategoryFilter = typeof FILTER_ALL | CompanyDocumentCategory
type UploadDestino = 'general' | 'quote' | 'invoice'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function DocumentsPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canEdit = profile?.role !== 'reader'

  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>(FILTER_ALL)
  const [filterCompanyId, setFilterCompanyId] = useState('all')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCompanyId, setUploadCompanyId] = useState('')
  const [uploadCategory, setUploadCategory] = useState<CompanyDocumentCategory>('otro')
  const [uploadDestino, setUploadDestino] = useState<UploadDocumentTarget>('general')
  const [uploadQuoteId, setUploadQuoteId] = useState('')
  const [uploadInvoiceId, setUploadInvoiceId] = useState('')
  const [notice, setNotice] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null)

  const docsQuery = useQuery(allCompanyDocumentsQueryOptions())

  const companiesQuery = useQuery({
    queryKey: ['companies-list-documents'],
    queryFn: async (): Promise<{ id: string; name: string }[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('status', 'activo')
        .order('name')
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; name: string }[]
    },
    enabled: canEdit,
  })

  const quotesForUpload = useQuery({
    queryKey: ['quotes-for-doc-upload', uploadCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, title')
        .eq('company_id', uploadCompanyId)
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    enabled: Boolean(uploadCompanyId) && uploadDestino === 'quote',
  })

  const invoicesForUpload = useQuery({
    queryKey: ['invoices-for-doc-upload', uploadCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, title, quote_id')
        .eq('company_id', uploadCompanyId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    enabled: Boolean(uploadCompanyId) && uploadDestino === 'invoice',
  })

  const companyOptions = useMemo(() => {
    const fromDocs = new Map<string, string>()
    for (const d of docsQuery.data ?? []) {
      if (d.companies?.id) fromDocs.set(d.companies.id, d.companies.name)
    }
    for (const c of companiesQuery.data ?? []) {
      fromDocs.set(c.id, c.name)
    }
    return [...fromDocs.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [docsQuery.data, companiesQuery.data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (docsQuery.data ?? []).filter(d => {
      if (filterCompanyId !== 'all' && d.company_id !== filterCompanyId) return false
      if (filterCategory !== FILTER_ALL && d.category !== filterCategory) return false
      if (!q) return true
      const company = (d.companies?.name ?? '').toLowerCase()
      const quote = d.quotes ? `${d.quotes.quote_number} ${d.quotes.title ?? ''}`.toLowerCase() : ''
      const inv = d.invoices ? `${d.invoices.invoice_number} ${d.invoices.title ?? ''}`.toLowerCase() : ''
      return (
        d.file_name.toLowerCase().includes(q)
        || (d.notes ?? '').toLowerCase().includes(q)
        || company.includes(q)
        || quote.includes(q)
        || inv.includes(q)
      )
    })
  }, [docsQuery.data, search, filterCategory, filterCompanyId])

  const uploadMutation = useMutation({
    mutationFn: (payload: {
      files: File[]
      companyId: string
      quoteId: string | null
      invoiceId: string | null
    }) =>
      uploadCompanyDocumentFiles(
        payload.files,
        payload.companyId,
        uploadCategory,
        payload.quoteId,
        payload.invoiceId,
      ),
    onSuccess: (res, vars) => {
      void queryClient.invalidateQueries({ queryKey: allCompanyDocumentsQueryKey() })
      void queryClient.invalidateQueries({ queryKey: ['company-documents', vars.companyId] })
      const parts: string[] = []
      if (res.uploaded > 0) parts.push(`${res.uploaded} archivo(s) cargado(s).`)
      if (res.failures.length > 0) {
        parts.push(`${res.failures.length} error(es): ${res.failures.map(f => f.name).join(', ')}`)
      }
      setNotice({
        type: res.uploaded > 0 && res.failures.length === 0 ? 'ok' : 'warn',
        text: parts.join(' ') || 'No se pudo completar la carga.',
      })
      window.setTimeout(() => setNotice(null), 8000)
      if (res.uploaded > 0) setUploadOpen(false)
    },
    onError: (e: Error) => setNotice({ type: 'warn', text: e.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (doc: CompanyDocument) => {
      await supabase.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([doc.storage_path])
      const { error } = await supabase.from('company_documents').delete().eq('id', doc.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: allCompanyDocumentsQueryKey() })
    },
  })

  const runUpload = useCallback(
    (files: File[]) => {
      if (!files.length || !uploadCompanyId) {
        setNotice({ type: 'warn', text: 'Seleccione una empresa.' })
        return
      }
      const resolved = resolveCompanyDocumentUploadTargets({
        destino: uploadDestino,
        quoteId: uploadQuoteId,
        invoiceId: uploadInvoiceId,
        invoices: (invoicesForUpload.data ?? []) as { id: string; quote_id?: string | null }[],
      })
      if (resolved.error) {
        setNotice({ type: 'warn', text: resolved.error })
        window.setTimeout(() => setNotice(null), 6000)
        return
      }
      uploadMutation.mutate({
        files,
        companyId: uploadCompanyId,
        quoteId: resolved.quoteId,
        invoiceId: resolved.invoiceId,
      })
    },
    [uploadMutation, uploadCompanyId, uploadDestino, uploadQuoteId, uploadInvoiceId, invoicesForUpload.data],
  )

  const onDownload = async (doc: CompanyDocument) => {
    const { data, error } = await supabase.storage
      .from(COMPANY_DOCUMENTS_BUCKET)
      .createSignedUrl(doc.storage_path, 3600)
    if (error || !data?.signedUrl) {
      setNotice({ type: 'warn', text: error?.message ?? 'No se pudo descargar.' })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const onDelete = (doc: CompanyDocumentListRow) => {
    if (!canEdit) return
    if (!window.confirm(`¿Eliminar «${doc.file_name}»?`)) return
    deleteMutation.mutate(doc, {
      onError: (e: Error) => setNotice({ type: 'warn', text: e.message }),
    })
  }

  const linkContext = (doc: CompanyDocumentListRow) => {
    if (doc.quote_id && doc.companies?.id) {
      return `/companies/${doc.companies.id}/v2?cfTab=quotes#seccion-seguimientos`
    }
    if (doc.invoice_id && doc.companies?.id) {
      return companyInvoiceFollowupHref(doc.companies.id, doc.invoice_id)
    }
    if (doc.companies?.id) {
      return `/companies/${doc.companies.id}/v2#seccion-documentos`
    }
    return null
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FolderOpen size={22} className="text-gray-500" />
            Documentos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Todos los archivos subidos al CRM: contratos, facturas PDF, órdenes de compra y adjuntos por empresa.
          </p>
        </div>
        {canEdit && (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setUploadOpen(v => !v)}>
            <Upload size={15} />
            {uploadOpen ? 'Ocultar carga' : 'Subir archivos'}
          </Button>
        )}
      </div>

      {notice && (
        <p
          className={cn(
            'text-sm rounded-lg px-3 py-2 border',
            notice.type === 'ok'
              ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
              : 'text-amber-900 bg-amber-50 border-amber-200',
          )}
        >
          {notice.text}
        </p>
      )}

      {docsQuery.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {(docsQuery.error as Error).message}
        </p>
      )}

      {canEdit && uploadOpen && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4 space-y-3">
          <p className="text-xs font-medium text-gray-700">Nueva carga</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Empresa *</Label>
              <Select
                value={uploadCompanyId || '__none__'}
                onValueChange={v => {
                  setUploadCompanyId(v === '__none__' ? '' : v)
                  setUploadQuoteId('')
                  setUploadInvoiceId('')
                }}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleccione empresa</SelectItem>
                  {companyOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <Select value={uploadCategory} onValueChange={v => setUploadCategory(v as CompanyDocumentCategory)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMPANY_DOCUMENT_CATEGORY_LABEL) as CompanyDocumentCategory[]).map(k => (
                    <SelectItem key={k} value={k}>{COMPANY_DOCUMENT_CATEGORY_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Asociar a</Label>
              <Select
                value={uploadDestino}
                onValueChange={v => setUploadDestino(v as UploadDocumentTarget)}
                disabled={!uploadCompanyId}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Empresa (general)</SelectItem>
                  <SelectItem value="quote">Cotización</SelectItem>
                  <SelectItem value="invoice">Factura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {uploadDestino === 'quote' && uploadCompanyId && (
              <div className="space-y-1">
                <Label className="text-xs">Cotización</Label>
                <Select value={uploadQuoteId || '__none__'} onValueChange={v => setUploadQuoteId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Elija" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccione</SelectItem>
                    {(quotesForUpload.data ?? []).map(q => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.quote_number}{q.title ? ` — ${q.title}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {uploadDestino === 'invoice' && uploadCompanyId && (
              <div className="space-y-1">
                <Label className="text-xs">Factura</Label>
                <Select value={uploadInvoiceId || '__none__'} onValueChange={v => setUploadInvoiceId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Elija" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccione</SelectItem>
                    {(invoicesForUpload.data ?? []).map(inv => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoice_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <CompanyDocumentUploadZone
            className="px-1 py-2"
            disabled={!uploadCompanyId}
            isUploading={uploadMutation.isPending}
            onFiles={runUpload}
            buttonLabel="Elegir archivos"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input
            className="pl-8 h-9 w-64 text-sm"
            placeholder="Buscar archivo, empresa, cotización…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las empresas</SelectItem>
            {companyOptions.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {[FILTER_ALL, ...Object.keys(COMPANY_DOCUMENT_CATEGORY_LABEL) as CompanyDocumentCategory[]].map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterCategory(k)}
              className={cn(
                'px-3 py-1.5 transition-colors whitespace-nowrap',
                filterCategory === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {k === FILTER_ALL ? 'Todas' : COMPANY_DOCUMENT_CATEGORY_LABEL[k]}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-auto">
          {filtered.length} de {docsQuery.data?.length ?? 0} archivo(s)
        </span>
      </div>

      <div className="border rounded-lg bg-white overflow-hidden">
        {docsQuery.isLoading ? (
          <p className="px-4 py-10 text-center text-gray-400 text-sm">Cargando documentos…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-gray-400 text-sm">Sin documentos</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-24 text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(doc => {
                  const ctxHref = linkContext(doc)
                  let vinculo = 'General'
                  if (doc.quotes) vinculo = `Cot. ${doc.quotes.quote_number}`
                  else if (doc.invoices) vinculo = `Fact. ${doc.invoices.invoice_number}`

                  return (
                    <TableRow key={doc.id} className="hover:bg-gray-50/80">
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={16} className="text-violet-600 shrink-0" />
                          <span className="text-sm truncate" title={doc.file_name}>{doc.file_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {COMPANY_DOCUMENT_CATEGORY_LABEL[doc.category as CompanyDocumentCategory] ?? doc.category}
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.companies?.id ? (
                          <Link
                            to={`/companies/${doc.companies.id}/v2#seccion-documentos`}
                            className="text-violet-700 hover:underline"
                          >
                            {doc.companies.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {ctxHref ? (
                          <Link to={ctxHref} className="text-violet-700 hover:underline">
                            {vinculo}
                          </Link>
                        ) : (
                          vinculo
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                        {fmtDate(doc.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          {ctxHref && (
                            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" asChild title="Ver en ficha">
                              <Link to={ctxHref}>
                                <Building2 size={14} className="text-gray-500" />
                              </Link>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="Descargar"
                            onClick={() => void onDownload(doc)}
                          >
                            <Download size={14} className="text-gray-500" />
                          </Button>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Eliminar"
                              onClick={() => onDelete(doc)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 size={14} className="text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
