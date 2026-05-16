import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCrmTask,
  crmInteractionsAllByCompanyQueryKey,
  crmInteractionsByQuoteQueryKey,
  crmInteractionsQueryKey,
  crmTasksAllByCompanyQueryKey,
  crmTasksAllByCompanyQueryOptions,
  crmTasksByQuoteQueryKey,
  crmTasksQueryKey,
  crmTasksQueryOptions,
  deleteCrmTask,
  tasksByQuoteQueryOptions,
  updateCrmTask,
} from '@/lib/interactionsV2Query'
import type { CrmTaskInsert, CrmTaskUpdate } from '@/types'

/** Tareas de cuenta (sin cotización) — vista principal en ficha empresa. */
export function useTasks(companyId: string | undefined, enabled = true) {
  return useQuery({
    ...crmTasksQueryOptions(companyId!),
    enabled: Boolean(companyId && enabled),
  })
}

/** Todas las tareas de la empresa (cuenta + cotizaciones). */
export function useTasksAllByCompany(companyId: string | undefined, enabled = true) {
  return useQuery({
    ...crmTasksAllByCompanyQueryOptions(companyId!),
    enabled: Boolean(companyId && enabled),
  })
}

/** Tareas CRM v2 filtradas por cotización. */
export function useTasksByQuote(quoteId: string | undefined, enabled = true) {
  return useQuery({
    ...tasksByQuoteQueryOptions(quoteId!),
    enabled: Boolean(quoteId && enabled),
  })
}

function invalidateTaskCaches(
  qc: ReturnType<typeof useQueryClient>,
  companyId: string,
  quoteId?: string,
) {
  void qc.invalidateQueries({ queryKey: crmTasksQueryKey(companyId) })
  void qc.invalidateQueries({ queryKey: crmTasksAllByCompanyQueryKey(companyId) })
  void qc.invalidateQueries({ queryKey: crmInteractionsQueryKey(companyId) })
  void qc.invalidateQueries({ queryKey: crmInteractionsAllByCompanyQueryKey(companyId) })
  if (quoteId) {
    void qc.invalidateQueries({ queryKey: crmTasksByQuoteQueryKey(quoteId) })
    void qc.invalidateQueries({ queryKey: crmInteractionsByQuoteQueryKey(quoteId) })
  }
}

export function useCreateTask(companyId: string, opts?: { quoteId?: string }) {
  const qc = useQueryClient()
  const quoteId = opts?.quoteId
  return useMutation({
    mutationFn: (row: Omit<CrmTaskInsert, 'company_id'>) => createCrmTask({ ...row, company_id: companyId }),
    onSuccess: () => {
      invalidateTaskCaches(qc, companyId, quoteId)
    },
  })
}

export function useUpdateTask(companyId: string, opts?: { quoteId?: string }) {
  const qc = useQueryClient()
  const quoteId = opts?.quoteId
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CrmTaskUpdate }) => updateCrmTask(id, patch),
    onSuccess: () => {
      invalidateTaskCaches(qc, companyId, quoteId)
    },
  })
}

export function useDeleteTask(companyId: string, opts?: { quoteId?: string }) {
  const qc = useQueryClient()
  const quoteId = opts?.quoteId
  return useMutation({
    mutationFn: (id: string) => deleteCrmTask(id),
    onSuccess: () => {
      invalidateTaskCaches(qc, companyId, quoteId)
    },
  })
}
