import { useQuery } from '@tanstack/react-query'
import {
  fetchCommercialFollowups,
  fetchInvoicesByCompany,
  fetchOpenReminder,
  type CommercialFollowupInsert,
  insertCommercialFollowup,
  insertInvoice,
  markInvoiceAsPaid,
  reopenInvoiceAsPending,
  reopenQuoteNegotiationStage,
  reopenCompanyCommercialReminder,
  updateCommercialFollowup,
  deleteCommercialFollowup,
  closeCommercialReminderManual,
  updateCommercialReminderDueDate,
  syncOpenReminderImportanceFromFollowup,
  syncOpenReminderDueDateFromFollowup,
} from '@/lib/commercialFollowupsQuery'
import type { CommercialFollowupSubject } from '@/types'

export const cfFollowupsQueryKey = (
  companyId: string,
  subject: CommercialFollowupSubject,
  quoteId?: string | null,
  invoiceId?: string | null,
) => ['cf-followups', companyId, subject, quoteId ?? '', invoiceId ?? ''] as const

export const cfOpenReminderQueryKey = (
  companyId: string,
  subject: CommercialFollowupSubject,
  quoteId?: string | null,
  invoiceId?: string | null,
) => ['cf-open-reminder', companyId, subject, quoteId ?? '', invoiceId ?? ''] as const

export const cfInvoicesQueryKey = (companyId: string) => ['cf-invoices', companyId] as const

export function useCommercialFollowupsList(opts: {
  companyId: string
  subjectType: CommercialFollowupSubject
  quoteId?: string | null
  invoiceId?: string | null
  enabled?: boolean
}) {
  const { companyId, subjectType, quoteId, invoiceId, enabled = true } = opts
  const ok =
    enabled &&
    Boolean(companyId) &&
    (subjectType === 'company' || (subjectType === 'quote' && Boolean(quoteId)) || (subjectType === 'invoice' && Boolean(invoiceId)))

  return useQuery({
    queryKey: cfFollowupsQueryKey(companyId, subjectType, quoteId, invoiceId),
    queryFn: () => fetchCommercialFollowups(companyId, subjectType, { quoteId: quoteId ?? undefined, invoiceId: invoiceId ?? undefined }),
    enabled: ok,
  })
}

export function useOpenCommercialReminder(opts: {
  companyId: string
  subjectType: CommercialFollowupSubject
  quoteId?: string | null
  invoiceId?: string | null
  enabled?: boolean
}) {
  const { companyId, subjectType, quoteId, invoiceId, enabled = true } = opts
  const ok =
    enabled &&
    Boolean(companyId) &&
    (subjectType === 'company' || (subjectType === 'quote' && Boolean(quoteId)) || (subjectType === 'invoice' && Boolean(invoiceId)))

  return useQuery({
    queryKey: cfOpenReminderQueryKey(companyId, subjectType, quoteId, invoiceId),
    queryFn: () => fetchOpenReminder(companyId, subjectType, { quoteId: quoteId ?? undefined, invoiceId: invoiceId ?? undefined }),
    enabled: ok,
  })
}

export function useInvoicesForCompany(companyId: string, enabled = true) {
  return useQuery({
    queryKey: cfInvoicesQueryKey(companyId),
    queryFn: () => fetchInvoicesByCompany(companyId),
    enabled: Boolean(companyId) && enabled,
  })
}

export {
  type CommercialFollowupInsert,
  insertCommercialFollowup,
  insertInvoice,
  markInvoiceAsPaid,
  reopenInvoiceAsPending,
  reopenQuoteNegotiationStage,
  reopenCompanyCommercialReminder,
  updateCommercialFollowup,
  deleteCommercialFollowup,
  closeCommercialReminderManual,
  updateCommercialReminderDueDate,
  syncOpenReminderImportanceFromFollowup,
  syncOpenReminderDueDateFromFollowup,
}
