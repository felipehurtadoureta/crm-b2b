import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createInteraction,
  crmInteractionsByQuoteQueryKey,
  crmInteractionsQueryKey,
  crmTasksAllByCompanyQueryKey,
  crmTasksByQuoteQueryKey,
  crmTasksQueryKey,
  deleteInteraction,
  crmInteractionsAllByCompanyQueryKey,
  interactionsAllByCompanyQueryOptions,
  interactionsByQuoteQueryOptions,
  interactionsQueryOptions,
  updateInteraction,
} from '@/lib/interactionsV2Query'
import type { InteractionInsert } from '@/types'

/** Interacciones de cuenta (sin cotización) — vista principal en ficha empresa. */
export function useInteractions(companyId: string | undefined, enabled = true) {
  return useQuery({
    ...interactionsQueryOptions(companyId!),
    enabled: Boolean(companyId && enabled),
  })
}

/** Todas las interacciones de la empresa (cuenta + cotizaciones). */
export function useInteractionsAllByCompany(companyId: string | undefined, enabled = true) {
  return useQuery({
    ...interactionsAllByCompanyQueryOptions(companyId!),
    enabled: Boolean(companyId && enabled),
  })
}

/** Interacciones v2 filtradas por cotización. */
export function useInteractionsByQuote(quoteId: string | undefined, enabled = true) {
  return useQuery({
    ...interactionsByQuoteQueryOptions(quoteId!),
    enabled: Boolean(quoteId && enabled),
  })
}

function invalidateInteractionCaches(
  qc: ReturnType<typeof useQueryClient>,
  companyId: string,
  quoteId?: string,
) {
  void qc.invalidateQueries({ queryKey: crmInteractionsQueryKey(companyId) })
  void qc.invalidateQueries({ queryKey: crmInteractionsAllByCompanyQueryKey(companyId) })
  void qc.invalidateQueries({ queryKey: crmTasksQueryKey(companyId) })
  void qc.invalidateQueries({ queryKey: crmTasksAllByCompanyQueryKey(companyId) })
  if (quoteId) {
    void qc.invalidateQueries({ queryKey: crmInteractionsByQuoteQueryKey(quoteId) })
    void qc.invalidateQueries({ queryKey: crmTasksByQuoteQueryKey(quoteId) })
  }
}

/** Crea interacción e invalida listas de la empresa (y por cotización si se indica). */
export function useCreateInteraction(companyId: string, opts?: { quoteId?: string }) {
  const qc = useQueryClient()
  const quoteId = opts?.quoteId
  return useMutation({
    mutationFn: (row: Omit<InteractionInsert, 'company_id'>) =>
      createInteraction({ ...row, company_id: companyId }),
    onSuccess: () => {
      invalidateInteractionCaches(qc, companyId, quoteId)
    },
  })
}

export function useUpdateInteraction(companyId: string, opts?: { quoteId?: string }) {
  const qc = useQueryClient()
  const quoteId = opts?.quoteId
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<InteractionInsert> }) => updateInteraction(id, patch),
    onSuccess: () => {
      invalidateInteractionCaches(qc, companyId, quoteId)
    },
  })
}

export function useDeleteInteraction(companyId: string, opts?: { quoteId?: string }) {
  const qc = useQueryClient()
  const quoteId = opts?.quoteId
  return useMutation({
    mutationFn: (id: string) => deleteInteraction(id),
    onSuccess: () => {
      invalidateInteractionCaches(qc, companyId, quoteId)
    },
  })
}
