/**
 * Seguimientos comerciales (llamados, cotización, factura): historial compacto, alta por modal y recordatorios en agenda.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Pencil, Plus, Trash2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  cfFollowupsQueryKey,
  cfOpenReminderQueryKey,
  cfInvoicesQueryKey,
  closeCommercialReminderManual,
  deleteCommercialFollowup,
  insertCommercialFollowup,
  markInvoiceAsPaid,
  reopenCompanyCommercialReminder,
  reopenInvoiceAsPending,
  reopenQuoteNegotiationStage,
  useCommercialFollowupsList,
  useInvoicesForCompany,
  useOpenCommercialReminder,
} from '@/hooks/useCommercialFollowups'
import {
  COMMERCIAL_FOLLOWUPS_NEXT_CHANNEL_MIGRATION_HINT,
  COMMERCIAL_FOLLOWUPS_SETUP_HINT,
  COMMERCIAL_NEXT_CHANNEL_LABEL,
  isCommercialFollowupsSchemaError,
  isMissingImportanceColumnMessage,
  isMissingNextChannelColumnMessage,
  labelCommercialNextChannel,
  syncOpenReminderDueDateFromFollowup,
  syncOpenReminderImportanceFromFollowup,
  syncOpenReminderNextChannelFromFollowup,
  updateCommercialFollowup,
} from '@/lib/commercialFollowupsQuery'
import { fmtCompactDate } from '@/lib/crmV2Display'
import { initialsFromFullName } from '@/lib/kamDisplay'
import type {
  Profile,
  Contact,
  Quote,
  CommercialFollowup,
  QuoteStage,
  CommercialFollowupImportance,
  CommercialFollowupNextChannel,
} from '@/types'
import { QUOTE_FOLLOWUP_CLOSED_STAGES } from '@/types'

type MainTab = 'company' | 'quotes' | 'invoices'

export type CompanyCommercialFollowupsQuoteRef = Pick<Quote, 'id' | 'quote_number' | 'title' | 'stage'>

const IMPORTANCE_LABEL: Record<CommercialFollowupImportance, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

function isQuoteSeguimientoAbierto(stage: QuoteStage) {
  return !(QUOTE_FOLLOWUP_CLOSED_STAGES as readonly string[]).includes(stage)
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(local: string) {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function nextFromDateOnly(ymd: string) {
  if (!ymd || ymd.length < 10) return null
  return `${ymd.slice(0, 10)}T12:00:00.000Z`
}

function kamLabel(kams: Profile[], id: string) {
  return kams.find(k => k.id === id)?.full_name ?? id.slice(0, 8)
}

function listScrollClass(count: number) {
  return count > 8 ? 'max-h-[min(28rem,72vh)] overflow-y-auto overscroll-contain pr-0.5' : ''
}

function bodyNeedsMore(body: string) {
  if (!body.trim()) return false
  const lines = body.trim().split(/\n/)
  return body.length > 120 || lines.length > 2
}

function ImportanceBadge({ level }: { level: CommercialFollowupImportance }) {
  const cls =
    level === 'alta'
      ? 'bg-red-100 text-red-800'
      : level === 'media'
        ? 'bg-amber-50 text-amber-900'
        : 'bg-gray-100 text-gray-600'
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', cls)}>{IMPORTANCE_LABEL[level]}</span>
  )
}

function contactNombreCargo(contacts: Contact[], contactId: string | null) {
  if (!contactId) return 'Sin contacto'
  const c = contacts.find(x => x.id === contactId)
  if (!c) return 'Contacto'
  const name = `${c.first_name} ${c.last_name}`.trim() || 'Contacto'
  const cargo = c.position?.trim()
  return cargo ? `${name} - ${cargo}` : name
}

/** Opciones `<select>` con cargo (cargo = `position`). */
function contactSelectOptionLabel(c: Contact) {
  const name = `${c.first_name} ${c.last_name}`.trim() || 'Contacto'
  const cargo = c.position?.trim()
  const base = cargo ? `${name} - ${cargo}` : name
  return c.is_primary ? `${base} · Principal` : base
}

function buildPlainTextHistory(rows: CommercialFollowup[], kams: Profile[], contacts: Contact[]) {
  return rows
    .map(row => {
      const kam = kamLabel(kams, row.created_by)
      const kamIni = initialsFromFullName(kam)
      const imp = row.importance ?? 'media'
      const cn = contactNombreCargo(contacts, row.contact_id)
      const prox = row.next_follow_up_at ? fmtCompactDate(row.next_follow_up_at) : '—'
      return `${fmtCompactDate(row.followed_at)} · KAM: ${kamIni} · ${cn} · ${IMPORTANCE_LABEL[imp]} · Próx.: ${prox}\n${row.body}\n----------`
    })
    .join('\n\n')
}

function FollowupHistoryRow({
  row,
  kams,
  contacts,
  isActive,
  canEdit,
  onEdit,
  onDelete,
  deleting,
  onShowMore,
}: {
  row: CommercialFollowup
  kams: Profile[]
  contacts: Contact[]
  isActive: boolean
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
  onShowMore: () => void
}) {
  const kamFull = kamLabel(kams, row.created_by)
  const kamIni = initialsFromFullName(kamFull)
  const more = bodyNeedsMore(row.body)
  const imp = row.importance ?? 'media'
  const contactLabel = contactNombreCargo(contacts, row.contact_id)
  const proxLabel = row.next_follow_up_at
    ? `${fmtCompactDate(row.next_follow_up_at)} · ${labelCommercialNextChannel(row.next_follow_up_kind)}`
    : '—'

  return (
    <li
      className={cn(
        'border-b border-gray-100 last:border-0 py-2.5 first:pt-0 transition-opacity',
        !isActive && 'opacity-45 text-gray-500',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-500">
            <span>{fmtCompactDate(row.followed_at)}</span>
            <span className="text-gray-300">·</span>
            <span>
              KAM: <span className="font-mono text-violet-900">{kamIni}</span>
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-700 max-w-[12rem] truncate" title={contactLabel}>
              {contactLabel}
            </span>
            <span className="text-gray-300">·</span>
            <ImportanceBadge level={imp} />
            <span className="text-gray-300">·</span>
            <span className="text-gray-600">
              Próx.: <span className="font-medium text-gray-800">{proxLabel}</span>
            </span>
          </div>
          <div className={cn('flex items-start gap-1', !isActive && 'opacity-90')}>
            <p className={cn('text-sm whitespace-pre-wrap line-clamp-2 flex-1 min-w-0', isActive ? 'text-gray-800' : 'text-gray-500')}>
              {row.body || '—'}
            </p>
            {more && (
              <button
                type="button"
                onClick={onShowMore}
                className={cn(
                  'shrink-0 text-sm font-bold leading-none pt-0.5',
                  isActive ? 'text-violet-600 hover:text-violet-800' : 'text-gray-400 hover:text-gray-600',
                )}
                title="Ver texto completo"
                aria-label="Más detalle"
              >
                +
              </button>
            )}
          </div>
        </div>
        {canEdit && (
          <div className={cn('flex shrink-0 gap-1', !isActive && 'opacity-70')}>
            <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" aria-label="Editar" onClick={onEdit}>
              <Pencil size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-8 w-8 text-red-600"
              aria-label="Eliminar"
              disabled={deleting}
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}

const IMPORTANCE_CHOICE_BTN =
  'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors'

const NEXT_CHANNEL_OPTIONS: CommercialFollowupNextChannel[] = ['reunion', 'mail', 'llamado']

export type CommercialFollowupsDocumentSync = {
  destino: 'general' | 'quote' | 'invoice'
  quoteId: string | null
  invoiceId: string | null
}

export interface CompanyCommercialFollowupsSectionProps {
  companyId: string
  contacts: Contact[]
  quotes: CompanyCommercialFollowupsQuoteRef[]
  kams: Profile[]
  canEdit: boolean
  anchorId?: string
  embeddedQuoteContext?: CompanyCommercialFollowupsQuoteRef | null
  /** Desde la URL de la ficha (`?cfTab=quotes`), abre esa pestaña al montar. */
  initialMainTab?: MainTab | null
  /** Desde la URL (`?cfInvoiceId=`), preselecciona la factura en seguimiento comercial. */
  initialInvoiceId?: string | null
  /** Desde SII (`?siiSalesId=`), selecciona la factura técnica asociada al documento RCV de ventas. */
  initialSiiSalesDocumentId?: string | null
  /** Sincroniza el gestor de documentos (destino y cotización/factura elegida en este módulo). */
  onDocumentLinkContextChange?: (ctx: CommercialFollowupsDocumentSync) => void
  /** Por encima de modales padre (p. ej. cotización en z-50). */
  overlayZIndex?: number
}

export default function CompanyCommercialFollowupsSection({
  companyId,
  contacts,
  quotes,
  kams,
  canEdit,
  anchorId = 'seccion-seguimientos',
  embeddedQuoteContext = null,
  initialMainTab = null,
  initialInvoiceId = null,
  initialSiiSalesDocumentId = null,
  onDocumentLinkContextChange,
  overlayZIndex = 50,
}: CompanyCommercialFollowupsSectionProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const embedded = Boolean(embeddedQuoteContext)
  const embeddedQuoteId = embeddedQuoteContext?.id ?? null

  const [mainTab, setMainTab] = useState<MainTab>('company')
  const [quoteId, setQuoteId] = useState<string | null>(() => quotes[0]?.id ?? null)
  const [invoiceId, setInvoiceId] = useState<string | null>(() => initialInvoiceId ?? null)

  const initializedTabFromUrl = useRef(false)
  useEffect(() => {
    initializedTabFromUrl.current = false
    setInvoiceId(initialInvoiceId ?? null)
  }, [companyId, initialInvoiceId])

  useEffect(() => {
    if (embedded || !initialMainTab || initializedTabFromUrl.current) return
    initializedTabFromUrl.current = true
    setMainTab(initialMainTab)
  }, [embedded, initialMainTab, companyId])

  useEffect(() => {
    if (embedded || !initialInvoiceId) return
    setMainTab('invoices')
  }, [embedded, initialInvoiceId, companyId])

  const [addOpen, setAddOpen] = useState(false)
  const [plainOpen, setPlainOpen] = useState(false)
  const [peekRow, setPeekRow] = useState<CommercialFollowup | null>(null)

  const [formContactId, setFormContactId] = useState<string>('')
  const [formFollowedAt, setFormFollowedAt] = useState(() => toDatetimeLocalValue(new Date().toISOString()))
  const [formBody, setFormBody] = useState('')
  const [formNextDate, setFormNextDate] = useState('')
  const [formNextChannel, setFormNextChannel] = useState<CommercialFollowupNextChannel>('llamado')
  const [formImportance, setFormImportance] = useState<CommercialFollowupImportance>('media')

  const invoicesQ = useInvoicesForCompany(companyId, !embedded)

  useEffect(() => {
    const list = invoicesQ.data ?? []
    if (mainTab !== 'invoices') return
    if (list.length === 0) {
      setInvoiceId(null)
      return
    }
    if (invoiceId && list.some(i => i.id === invoiceId)) return
    if (initialInvoiceId && list.some(i => i.id === initialInvoiceId)) {
      setInvoiceId(initialInvoiceId)
      return
    }
    if (
      initialSiiSalesDocumentId &&
      list.some(i => i.sii_sales_document_id === initialSiiSalesDocumentId)
    ) {
      const match = list.find(i => i.sii_sales_document_id === initialSiiSalesDocumentId)
      setInvoiceId(match?.id ?? null)
      return
    }
    setInvoiceId(list[0]?.id ?? null)
  }, [mainTab, invoicesQ.data, invoiceId, initialInvoiceId, initialSiiSalesDocumentId])

  const subjectType = useMemo((): 'company' | 'quote' | 'invoice' => {
    if (embedded) return 'quote'
    if (mainTab === 'company') return 'company'
    if (mainTab === 'quotes') return 'quote'
    return 'invoice'
  }, [embedded, mainTab])

  const quoteIdEff = embedded ? embeddedQuoteId : mainTab === 'quotes' ? quoteId : null
  const invoiceIdEff = embedded ? null : mainTab === 'invoices' ? invoiceId : null

  useEffect(() => {
    if (!onDocumentLinkContextChange) return
    if (embedded && embeddedQuoteId) {
      onDocumentLinkContextChange({ destino: 'quote', quoteId: embeddedQuoteId, invoiceId: null })
      return
    }
    if (mainTab === 'company') {
      onDocumentLinkContextChange({ destino: 'general', quoteId: null, invoiceId: null })
      return
    }
    if (mainTab === 'quotes') {
      onDocumentLinkContextChange({ destino: 'quote', quoteId: quoteId ?? null, invoiceId: null })
      return
    }
    onDocumentLinkContextChange({ destino: 'invoice', quoteId: null, invoiceId: invoiceId ?? null })
  }, [onDocumentLinkContextChange, embedded, embeddedQuoteId, mainTab, quoteId, invoiceId])

  const listEnabled =
    embedded
      ? Boolean(embeddedQuoteId)
      : mainTab === 'company' ||
        (mainTab === 'quotes' && Boolean(quoteIdEff)) ||
        (mainTab === 'invoices' && Boolean(invoiceIdEff))

  const followupsQ = useCommercialFollowupsList({
    companyId,
    subjectType,
    quoteId: quoteIdEff,
    invoiceId: invoiceIdEff,
    enabled: listEnabled,
  })

  const reminderQ = useOpenCommercialReminder({
    companyId,
    subjectType,
    quoteId: quoteIdEff,
    invoiceId: invoiceIdEff,
    enabled: listEnabled,
  })

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    const def = contacts.find(c => c.is_primary && c.is_active)?.id ?? contacts.find(c => c.is_active)?.id ?? ''
    setFormContactId(def)
  }, [contacts])

  useEffect(() => {
    if (!addOpen) return
    const def = contacts.find(c => c.is_primary && c.is_active)?.id ?? contacts.find(c => c.is_active)?.id ?? ''
    setFormContactId(def)
    setFormFollowedAt(toDatetimeLocalValue(new Date().toISOString()))
    setFormBody('')
    setFormNextDate('')
    setFormNextChannel('llamado')
    setFormImportance('media')
  }, [addOpen, contacts])

  const invalidateThread = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cfFollowupsQueryKey(companyId, subjectType, quoteIdEff, invoiceIdEff) })
    void queryClient.invalidateQueries({ queryKey: cfOpenReminderQueryKey(companyId, subjectType, quoteIdEff, invoiceIdEff) })
    void queryClient.invalidateQueries({ queryKey: ['agenda-pendientes'] })
  }, [queryClient, companyId, subjectType, quoteIdEff, invoiceIdEff])

  const invalidateInvoices = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cfInvoicesQueryKey(companyId) })
  }, [queryClient, companyId])

  const insertMut = useMutation({
    mutationFn: insertCommercialFollowup,
    onSuccess: () => {
      invalidateThread()
      setAddOpen(false)
      setFormBody('')
      setFormNextDate('')
      setFormFollowedAt(toDatetimeLocalValue(new Date().toISOString()))
    },
  })

  const closeReminderMut = useMutation({
    mutationFn: closeCommercialReminderManual,
    onSuccess: () => {
      invalidateThread()
    },
  })

  const markInvoicePaidMut = useMutation({
    mutationFn: markInvoiceAsPaid,
    onSuccess: () => {
      invalidateThread()
      invalidateInvoices()
    },
  })

  const reopenInvoiceMut = useMutation({
    mutationFn: reopenInvoiceAsPending,
    onSuccess: () => {
      invalidateThread()
      invalidateInvoices()
    },
  })

  const reopenQuoteMut = useMutation({
    mutationFn: reopenQuoteNegotiationStage,
    onSuccess: (_void, quoteIdReopened) => {
      invalidateThread()
      navigate(`/quotes?quoteId=${encodeURIComponent(quoteIdReopened)}&view=kanban`)
    },
  })

  const reopenCompanyMut = useMutation({
    mutationFn: () => reopenCompanyCommercialReminder(companyId),
    onSuccess: () => {
      invalidateThread()
    },
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      setDeletingId(id)
      await deleteCommercialFollowup(id)
    },
    onSuccess: () => {
      invalidateThread()
      setDeletingId(null)
    },
    onError: () => setDeletingId(null),
  })

  const [editing, setEditing] = useState<CommercialFollowup | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editFollowedAt, setEditFollowedAt] = useState('')
  const [editContactId, setEditContactId] = useState('')
  const [editImportance, setEditImportance] = useState<CommercialFollowupImportance>('media')
  const [editNextDate, setEditNextDate] = useState('')
  const [editNextChannel, setEditNextChannel] = useState<CommercialFollowupNextChannel>('llamado')

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Parameters<typeof updateCommercialFollowup>[1] }) => {
      const updated = await updateCommercialFollowup(id, patch)
      if (patch.importance !== undefined) {
        await syncOpenReminderImportanceFromFollowup(id, patch.importance)
      }
      if (patch.next_follow_up_at) {
        await syncOpenReminderDueDateFromFollowup(id, patch.next_follow_up_at)
      }
      if (patch.next_follow_up_kind) {
        await syncOpenReminderNextChannelFromFollowup(id, patch.next_follow_up_kind)
      }
      return updated
    },
    onSuccess: () => {
      invalidateThread()
      setEditing(null)
    },
  })

  const openEdit = (row: CommercialFollowup) => {
    setEditing(row)
    setEditBody(row.body)
    setEditFollowedAt(toDatetimeLocalValue(row.followed_at))
    setEditContactId(row.contact_id ?? '')
    setEditImportance(row.importance ?? 'media')
    setEditNextDate(row.next_follow_up_at ? row.next_follow_up_at.slice(0, 10) : '')
    setEditNextChannel(row.next_follow_up_kind ?? 'llamado')
  }

  const schemaHint = useMemo(() => {
    const err = followupsQ.error
    if (!(err instanceof Error)) return null
    if (isMissingNextChannelColumnMessage(err.message)) return COMMERCIAL_FOLLOWUPS_NEXT_CHANNEL_MIGRATION_HINT
    if (isMissingImportanceColumnMessage(err.message)) return null
    if (isCommercialFollowupsSchemaError(err.message)) return COMMERCIAL_FOLLOWUPS_SETUP_HINT
    return null
  }, [followupsQ.error])

  const tabBtn = (id: MainTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMainTab(id)}
      className={cn(
        'rounded-md px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0',
        mainTab === id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      )}
    >
      {label}
    </button>
  )

  const activeContacts = contacts.filter(c => c.is_active)
  const selectedQuote = embedded
    ? (embeddedQuoteContext ?? quotes.find(q => q.id === quoteIdEff) ?? null)
    : quotes.find(q => q.id === quoteIdEff)
  const selectedInvoice = (invoicesQ.data ?? []).find(i => i.id === invoiceIdEff)
  const quoteHiloAbierto = !selectedQuote || isQuoteSeguimientoAbierto(selectedQuote.stage)
  const invoiceHiloAbierto =
    !selectedInvoice ||
    (selectedInvoice.status !== 'pagada' &&
      selectedInvoice.status !== 'anulada' &&
      selectedInvoice.status !== 'nota_credito')
  const canSubmitNew =
    canEdit &&
    formContactId &&
    formBody.trim().length > 0 &&
    formNextDate.trim().length >= 10 &&
    (embedded
      ? Boolean(quoteIdEff) && quoteHiloAbierto
      : (mainTab !== 'quotes' || Boolean(quoteIdEff)) &&
        (mainTab !== 'invoices' || Boolean(invoiceIdEff)) &&
        (mainTab !== 'quotes' || quoteHiloAbierto) &&
        (mainTab !== 'invoices' || invoiceHiloAbierto))

  const submitNewFromModal = () => {
    if (!canSubmitNew) return
    const nextIso = nextFromDateOnly(formNextDate.trim())
    if (!nextIso) return
    insertMut.mutate({
      company_id: companyId,
      subject_type: subjectType,
      contact_id: formContactId,
      followed_at: fromDatetimeLocal(formFollowedAt),
      body: formBody.trim(),
      next_follow_up_at: nextIso,
      quote_id: subjectType === 'quote' ? quoteIdEff : null,
      invoice_id: subjectType === 'invoice' ? invoiceIdEff : null,
      created_by: null,
      importance: formImportance,
      next_follow_up_kind: formNextChannel,
    })
  }

  /** Misma lista sin duplicar `id` (evita filas repetidas por cachés o errores aguas arriba). */
  const followupsRows = useMemo(() => {
    const raw = followupsQ.data ?? []
    const seen = new Set<string>()
    const out: CommercialFollowup[] = []
    for (const r of raw) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      out.push(r)
    }
    return out
  }, [followupsQ.data])

  const resolvedActiveFollowupId = useMemo(() => {
    if (followupsRows.length === 0) return null
    const src = reminderQ.data?.source_followup_id ?? null
    if (src && followupsRows.some(r => r.id === src)) return src
    return followupsRows[0].id
  }, [followupsRows, reminderQ.data?.source_followup_id])

  const plainTextContent = useMemo(
    () =>
      followupsRows.length
        ? buildPlainTextHistory(followupsRows, kams, contacts)
        : '(Sin registros en esta pestaña.)',
    [followupsRows, kams, contacts],
  )

  const quoteThreadCerrado = Boolean(quoteIdEff) && !quoteHiloAbierto
  const invoiceThreadCerrado = Boolean(invoiceIdEff) && !invoiceHiloAbierto
  const companyThreadCerrado =
    !embedded &&
    mainTab === 'company' &&
    followupsRows.length > 0 &&
    !reminderQ.data &&
    !followupsQ.isLoading &&
    !reminderQ.isLoading

  const threadCerrado = embedded
    ? quoteThreadCerrado
    : mainTab === 'company'
      ? companyThreadCerrado
      : mainTab === 'quotes'
        ? quoteThreadCerrado
        : invoiceThreadCerrado

  const canReopenThisThread =
    canEdit &&
    threadCerrado &&
    ((embedded || mainTab === 'quotes')
      ? quoteThreadCerrado
      : mainTab === 'invoices'
        ? selectedInvoice?.status === 'pagada'
        : companyThreadCerrado)

  const showMarkInvoicePaidAction =
    Boolean(reminderQ.data) &&
    canEdit &&
    !embedded &&
    mainTab === 'invoices' &&
    invoiceHiloAbierto &&
    selectedInvoice &&
    (selectedInvoice.status === 'pendiente' || selectedInvoice.status === 'borrador')

  const reopenError =
    (reopenInvoiceMut.error as Error | undefined)?.message ??
    (reopenQuoteMut.error as Error | undefined)?.message ??
    (reopenCompanyMut.error as Error | undefined)?.message

  const kanbanQuoteHref = quoteIdEff ? `/quotes?quoteId=${encodeURIComponent(quoteIdEff)}&view=kanban` : null

  const reopenActionIdleLabel =
    embedded || mainTab === 'quotes' ? 'Reabrir' : mainTab === 'invoices' ? 'Factura pagada - Reabrir' : 'Reabrir hilo'

  /** Capas hijas por encima del modal de cotización u otros contenedores fijos. */
  const overlayZ = overlayZIndex

  const modalOverlay = (content: ReactNode) =>
    typeof document !== 'undefined' ? createPortal(content, document.body) : content

  const importancePicker = (value: CommercialFollowupImportance, onChange: (v: CommercialFollowupImportance) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {(['baja', 'media', 'alta'] as const).map(imp => (
        <button
          key={imp}
          type="button"
          onClick={() => onChange(imp)}
          className={cn(
            IMPORTANCE_CHOICE_BTN,
            value === imp ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          )}
        >
          {IMPORTANCE_LABEL[imp]}
        </button>
      ))}
    </div>
  )

  const nextChannelPicker = (value: CommercialFollowupNextChannel, onChange: (v: CommercialFollowupNextChannel) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {NEXT_CHANNEL_OPTIONS.map(ch => (
        <button
          key={ch}
          type="button"
          onClick={() => onChange(ch)}
          className={cn(
            IMPORTANCE_CHOICE_BTN,
            value === ch ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          )}
        >
          {COMMERCIAL_NEXT_CHANNEL_LABEL[ch]}
        </button>
      ))}
    </div>
  )

  return (
    <section id={anchorId} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-6">
      <div className="px-4 py-2.5 border-b bg-gray-50 flex flex-nowrap items-center justify-between gap-3 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-800 shrink-0">
            {embedded ? 'Historial comercial' : 'Seguimiento comercial'}
          </h2>
          {embedded && embeddedQuoteContext ? (
            <>
              <span className="text-xs text-gray-500 min-w-0 truncate">
                <span className="font-mono text-gray-700">{embeddedQuoteContext.quote_number}</span>
                {embeddedQuoteContext.title ? ` · ${embeddedQuoteContext.title}` : ''}
                <span className="text-gray-400"> ({embeddedQuoteContext.stage})</span>
              </span>
              {kanbanQuoteHref ? (
                <Link
                  to={kanbanQuoteHref}
                  className="text-xs text-violet-700 hover:text-violet-900 font-medium underline-offset-2 hover:underline whitespace-nowrap shrink-0"
                >
                  Kanban
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
        {!embedded && (
          <div className="flex flex-nowrap items-center justify-end gap-1.5 min-w-0 overflow-x-auto pb-px">
            {tabBtn('company', 'Llamados')}
            {tabBtn('quotes', 'Cotizaciones')}
            {tabBtn('invoices', 'Facturas (SII)')}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {schemaHint && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{schemaHint}</div>
        )}

        {followupsQ.isError && !schemaHint && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap',
              followupsQ.error instanceof Error && isMissingImportanceColumnMessage(followupsQ.error.message)
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-red-200 bg-red-50 text-red-800',
            )}
          >
            {(followupsQ.error as Error).message}
          </div>
        )}

        {mainTab === 'quotes' && !embedded && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap pb-1">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-600 shrink-0">Cotización</label>
              <select
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-md w-full sm:w-auto"
                value={quoteId ?? ''}
                onChange={e => setQuoteId(e.target.value || null)}
              >
                {quotes.length === 0 ? (
                  <option value="">Sin cotizaciones</option>
                ) : (
                  quotes.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.quote_number} · {q.title ?? 'Sin título'} ({q.stage})
                      {!isQuoteSeguimientoAbierto(q.stage) ? ' — cerrada' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
            {kanbanQuoteHref ? (
              <Link
                to={kanbanQuoteHref}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium underline-offset-2 hover:underline shrink-0"
              >
                Abrir en cotizaciones (Kanban, solo esta cotización)
              </Link>
            ) : null}
          </div>
        )}

        {invoicesQ.isError && mainTab === 'invoices' && !embedded && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {(invoicesQ.error as Error).message}
          </div>
        )}

        {mainTab === 'invoices' && !embedded && (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center flex-wrap pb-1">
            <label className="text-xs font-medium text-gray-600 shrink-0">
              Factura SII
              {(invoicesQ.data?.length ?? 0) > 0 && (
                <span className="ml-1 font-normal text-gray-400">({invoicesQ.data?.length})</span>
              )}
            </label>
            <select
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-md w-full sm:w-auto"
              value={invoiceId ?? ''}
              onChange={e => setInvoiceId(e.target.value || null)}
              disabled={invoicesQ.isLoading || (invoicesQ.data?.length ?? 0) === 0}
            >
              {(invoicesQ.data ?? []).length === 0 ? (
                <option value="">
                  {invoicesQ.isLoading
                    ? 'Cargando…'
                    : 'Sin facturas SII vinculadas a esta empresa'}
                </option>
              ) : (
                (invoicesQ.data ?? []).map(inv => (
                  <option key={inv.id} value={inv.id}>
                    Folio {inv.invoice_number} · {inv.status} ·{' '}
                    {Number(inv.total).toLocaleString('es-CL')} {inv.currency}
                  </option>
                ))
              )}
            </select>
            {invoicesQ.isLoading && <span className="text-xs text-gray-400">Cargando facturas SII…</span>}
            <Link
              to="/sii"
              className="text-xs text-violet-700 hover:text-violet-900 font-medium underline-offset-2 hover:underline shrink-0"
            >
              Abrir SII (RCV)
            </Link>
          </div>
        )}

        {threadCerrado && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-amber-950">
            <div className="space-y-0.5 min-w-0">
              {!canEdit && (
                <p className="text-amber-900/90">Solo quienes pueden editar la empresa pueden reabrir el seguimiento.</p>
              )}
              {mainTab === 'invoices' && selectedInvoice?.status === 'anulada' && canEdit && (
                <p className="text-amber-900">Las facturas anuladas no se reactivan desde esta pantalla.</p>
              )}
              {reopenError && <p className="text-red-700 text-[11px]">{reopenError}</p>}
            </div>
            {canReopenThisThread && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-amber-300 shrink-0"
                disabled={reopenInvoiceMut.isPending || reopenQuoteMut.isPending || reopenCompanyMut.isPending}
                onClick={() => {
                  if (embedded || mainTab === 'quotes') {
                    if (!quoteIdEff) return
                    if (
                      !window.confirm(
                        '¿Volver esta cotización a «En negociación»? Podrá registrar seguimientos otra vez.',
                      )
                    )
                      return
                    reopenQuoteMut.mutate(quoteIdEff)
                  } else if (mainTab === 'invoices') {
                    if (!invoiceIdEff) return
                    if (
                      !window.confirm(
                        '¿Volver esta factura a «Pendiente de pago»? Compruebe que el pago no esté registrado en otro sistema.',
                      )
                    )
                      return
                    reopenInvoiceMut.mutate(invoiceIdEff)
                  } else {
                    if (
                      !window.confirm(
                        '¿Crear de nuevo un pendiente en la agenda a partir del último llamado registrado?',
                      )
                    )
                      return
                    reopenCompanyMut.mutate()
                  }
                }}
              >
                {reopenInvoiceMut.isPending || reopenQuoteMut.isPending || reopenCompanyMut.isPending
                  ? 'Reabriendo…'
                  : reopenActionIdleLabel}
              </Button>
            )}
          </div>
        )}

        <div className={cn('space-y-4 transition-opacity', threadCerrado && 'opacity-[0.42]')}>

        {reminderQ.data && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-blue-900">
              <span className="font-medium">Pendiente en agenda:</span>{' '}
              {labelCommercialNextChannel(reminderQ.data.next_follow_up_kind)} · {fmtCompactDate(reminderQ.data.due_date)}
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-2 justify-end">
                {showMarkInvoicePaidAction ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-emerald-200 text-emerald-900 bg-emerald-50/80 hover:bg-emerald-50"
                    disabled={markInvoicePaidMut.isPending || closeReminderMut.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          '¿Marcar la factura como pagada? Se actualizará el estado de la factura, se cerrará este pendiente en la agenda y dejará de contar como factura pendiente de cobro.',
                        )
                      )
                        return
                      if (invoiceIdEff) markInvoicePaidMut.mutate(invoiceIdEff)
                    }}
                  >
                    {markInvoicePaidMut.isPending ? 'Guardando…' : 'Factura pagada'}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-blue-200"
                    disabled={closeReminderMut.isPending || markInvoicePaidMut.isPending}
                    onClick={() => {
                      if (!window.confirm('¿Cerrar este pendiente sin registrar un nuevo seguimiento?')) return
                      closeReminderMut.mutate(reminderQ.data!.id)
                    }}
                  >
                    Cerrar sin nuevo registro
                  </Button>
                )}
              </div>
            )}
            {markInvoicePaidMut.isError && (
              <p className="text-[11px] text-red-700 w-full">{(markInvoicePaidMut.error as Error).message}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canEdit &&
            (embedded
              ? !quoteIdEff || quoteHiloAbierto
              : (mainTab !== 'quotes' || !quoteIdEff || quoteHiloAbierto) &&
                (mainTab !== 'invoices' || !invoiceIdEff || invoiceHiloAbierto)) && (
              <Button type="button" size="sm" className="h-8 text-xs gap-1" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> Agregar
              </Button>
            )}
          {followupsRows.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setPlainOpen(true)}>
              <FileText size={14} />
              Ver historial en texto plano
            </Button>
          )}
        </div>

        <div>
          {!embedded && (
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Historial</h3>
          )}
          {followupsQ.isLoading ? (
            <p className="text-sm text-gray-400 py-4">Cargando…</p>
          ) : followupsRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">Sin registros en esta pestaña.</p>
          ) : (
            <ul className={cn('divide-y divide-gray-100 border border-gray-100 rounded-lg px-3', listScrollClass(followupsRows.length))}>
              {followupsRows.map(row => (
                <FollowupHistoryRow
                  key={row.id}
                  row={row}
                  kams={kams}
                  contacts={contacts}
                  isActive={resolvedActiveFollowupId != null && row.id === resolvedActiveFollowupId}
                  canEdit={canEdit}
                  onEdit={() => openEdit(row)}
                  onDelete={() => {
                    if (!window.confirm('¿Eliminar este registro del historial?')) return
                    deleteMut.mutate(row.id)
                  }}
                  deleting={deletingId === row.id && deleteMut.isPending}
                  onShowMore={() => setPeekRow(row)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>

      {/* Modal compacto: nuevo seguimiento */}
      {addOpen &&
        modalOverlay(
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: overlayZ }} role="dialog" aria-modal>
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Nuevo seguimiento</h4>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setAddOpen(false)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase text-gray-500">Contacto</label>
                <select
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  value={formContactId}
                  onChange={e => setFormContactId(e.target.value)}
                >
                  <option value="">Seleccione…</option>
                  {activeContacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {contactSelectOptionLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Fecha del seguimiento</label>
                <input
                  type="datetime-local"
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  value={formFollowedAt}
                  onChange={e => setFormFollowedAt(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Detalle</label>
                <textarea
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white min-h-[4.5rem]"
                  value={formBody}
                  onChange={e => setFormBody(e.target.value)}
                  placeholder="Qué se conversó o acordó…"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500 mb-1 block">Importancia</label>
                {importancePicker(formImportance, setFormImportance)}
                <p className="text-[10px] text-gray-400 mt-1">Alta: se resalta en la agenda al ver el detalle del día.</p>
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Próximo seguimiento (agenda)</label>
                <input
                  type="date"
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  value={formNextDate}
                  onChange={e => setFormNextDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500 mb-1 block">Tipo de próximo contacto</label>
                {nextChannelPicker(formNextChannel, setFormNextChannel)}
                <p className="text-[10px] text-gray-400 mt-1">Aparece en el título del evento en la agenda (Reunión, Mail o Llamado).</p>
              </div>
              {insertMut.isError && <p className="text-xs text-red-600">{(insertMut.error as Error).message}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" disabled={!canSubmitNew || insertMut.isPending || Boolean(schemaHint)} onClick={submitNewFromModal}>
                  {insertMut.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        )}

      {/* Texto plano */}
      {plainOpen &&
        modalOverlay(
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: overlayZ }} role="dialog" aria-modal>
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h4 className="text-sm font-semibold text-gray-900">Historial (texto plano)</h4>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-lg leading-none" onClick={() => setPlainOpen(false)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <pre className="p-4 text-xs text-gray-800 whitespace-pre-wrap font-sans bg-gray-50 overflow-y-auto flex-1 border-t border-gray-100">{plainTextContent}</pre>
          </div>
        </div>,
        )}

      {/* Detalle una fila (+) */}
      {peekRow &&
        modalOverlay(
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: overlayZ }} role="dialog" aria-modal>
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg w-full max-w-2xl">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0 gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fmtCompactDate(peekRow.followed_at)} · KAM: {initialsFromFullName(kamLabel(kams, peekRow.created_by))}
                  </p>
                  <ImportanceBadge level={peekRow.importance ?? 'media'} />
                </div>
                <p className="text-xs text-gray-600 truncate" title={contactNombreCargo(contacts, peekRow.contact_id)}>
                  {contactNombreCargo(contacts, peekRow.contact_id)}
                  {peekRow.next_follow_up_at ? (
                    <>
                      <span className="text-gray-400"> · </span>
                      Próx.: {fmtCompactDate(peekRow.next_follow_up_at)} ·{' '}
                      {labelCommercialNextChannel(peekRow.next_follow_up_kind)}
                    </>
                  ) : null}
                </p>
              </div>
              <button type="button" className="text-gray-400 hover:text-gray-600 shrink-0" onClick={() => setPeekRow(null)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{peekRow.body || '—'}</p>
            </div>
          </div>
        </div>,
        )}

      {editing &&
        modalOverlay(
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{ zIndex: overlayZ }} role="dialog" aria-modal>
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-900">Editar seguimiento</h4>
              <button type="button" className="text-gray-400 hover:text-gray-600" onClick={() => setEditing(null)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] uppercase text-gray-500">Contacto</label>
                <select
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  value={editContactId}
                  onChange={e => setEditContactId(e.target.value)}
                >
                  <option value="">—</option>
                  {activeContacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {contactSelectOptionLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Fecha</label>
                <input
                  type="datetime-local"
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  value={editFollowedAt}
                  onChange={e => setEditFollowedAt(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Importancia</label>
                <div className="mt-1">{importancePicker(editImportance, setEditImportance)}</div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Próximo seguimiento (agenda)</label>
                <input
                  type="date"
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                  value={editNextDate}
                  onChange={e => setEditNextDate(e.target.value)}
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Si coincide con el recordatorio abierto, se actualiza la fecha en la agenda.</p>
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500 mb-1 block">Tipo de próximo contacto</label>
                {nextChannelPicker(editNextChannel, setEditNextChannel)}
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500">Detalle</label>
                <textarea
                  className="mt-0.5 w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 min-h-[5rem] bg-white"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                />
              </div>
              {updateMut.isError && <p className="text-xs text-red-600">{(updateMut.error as Error).message}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={updateMut.isPending || !editBody.trim() || editNextDate.trim().length < 10}
                  onClick={() => {
                    const nextIso = nextFromDateOnly(editNextDate.trim())
                    if (!nextIso) return
                    updateMut.mutate({
                      id: editing.id,
                      patch: {
                        body: editBody.trim(),
                        followed_at: fromDatetimeLocal(editFollowedAt),
                        contact_id: editContactId || null,
                        importance: editImportance,
                        next_follow_up_at: nextIso,
                        next_follow_up_kind: editNextChannel,
                      },
                    })
                  }}
                >
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>,
        )}
    </section>
  )
}
