import { supabase } from '@/lib/supabase'
import type { CrmTask, CrmTaskInsert, CrmTaskUpdate, Interaction, InteractionInsert } from '@/types'

function missingTableError(err: { message?: string; code?: string }): boolean {
  return err.code === '42P01' || (err.message?.includes('relation') ?? false) || (err.message?.includes('does not exist') ?? false)
}

/** Lista todas las interacciones de una empresa (cuenta + cotizaciones). */
export async function fetchInteractionsByCompany(companyId: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('company_id', companyId)
    .order('interaction_date', { ascending: false })

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as Interaction[]
}

/** Interacciones de la cuenta (sin cotización vinculada). */
export async function fetchInteractionsByCompanyAccount(companyId: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('company_id', companyId)
    .is('quote_id', null)
    .order('interaction_date', { ascending: false })

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as Interaction[]
}

/** Lista tareas CRM de una empresa (cuenta + cotizaciones). */
export async function fetchTasksByCompany(companyId: string): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as CrmTask[]
}

/** Tareas de la cuenta (sin cotización vinculada). */
export async function fetchTasksByCompanyAccount(companyId: string): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
    .is('quote_id', null)
    .order('due_date', { ascending: true })

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as CrmTask[]
}

/** Lista interacciones vinculadas a una cotización. */
export async function fetchInteractionsByQuote(quoteId: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .eq('quote_id', quoteId)
    .order('interaction_date', { ascending: false })

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as Interaction[]
}

/** Lista tareas CRM vinculadas a una cotización. */
export async function fetchTasksByQuote(quoteId: string): Promise<CrmTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('quote_id', quoteId)
    .order('due_date', { ascending: true })

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return (data ?? []) as CrmTask[]
}

export const crmInteractionsByQuoteQueryKey = (quoteId: string) => ['crm-interactions', 'quote', quoteId] as const

export const crmTasksByQuoteQueryKey = (quoteId: string) => ['crm-tasks', 'quote', quoteId] as const

export function interactionsByQuoteQueryOptions(quoteId: string) {
  return {
    queryKey: crmInteractionsByQuoteQueryKey(quoteId),
    queryFn: () => fetchInteractionsByQuote(quoteId),
  }
}

export function tasksByQuoteQueryOptions(quoteId: string) {
  return {
    queryKey: crmTasksByQuoteQueryKey(quoteId),
    queryFn: () => fetchTasksByQuote(quoteId),
  }
}

/** Interacciones solo de cuenta (ficha empresa — historial principal). */
export const crmInteractionsQueryKey = (companyId: string) => ['crm-interactions', 'account', companyId] as const

/** Todas las interacciones de la empresa (historial completo «Todas», conteos por cotización). */
export const crmInteractionsAllByCompanyQueryKey = (companyId: string) =>
  ['crm-interactions', 'all', companyId] as const

/** Tareas solo de cuenta. */
export const crmTasksQueryKey = (companyId: string) => ['crm-tasks', 'account', companyId] as const

/** Todas las tareas de la empresa. */
export const crmTasksAllByCompanyQueryKey = (companyId: string) => ['crm-tasks', 'all', companyId] as const

export function interactionsQueryOptions(companyId: string) {
  return {
    queryKey: crmInteractionsQueryKey(companyId),
    queryFn: () => fetchInteractionsByCompanyAccount(companyId),
  }
}

export function interactionsAllByCompanyQueryOptions(companyId: string) {
  return {
    queryKey: crmInteractionsAllByCompanyQueryKey(companyId),
    queryFn: () => fetchInteractionsByCompany(companyId),
  }
}

export function crmTasksQueryOptions(companyId: string) {
  return {
    queryKey: crmTasksQueryKey(companyId),
    queryFn: () => fetchTasksByCompanyAccount(companyId),
  }
}

export function crmTasksAllByCompanyQueryOptions(companyId: string) {
  return {
    queryKey: crmTasksAllByCompanyQueryKey(companyId),
    queryFn: () => fetchTasksByCompany(companyId),
  }
}

/** Inserta una interacción y devuelve la fila creada. */
export async function createInteraction(row: InteractionInsert): Promise<Interaction> {
  const { data, error } = await supabase.from('interactions').insert(row).select('*').single()

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return data as Interaction
}

/** Actualiza una interacción. */
export async function updateInteraction(id: string, patch: Partial<InteractionInsert>): Promise<Interaction> {
  const { data, error } = await supabase.from('interactions').update(patch).eq('id', id).select('*').single()

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return data as Interaction
}

export async function deleteInteraction(id: string): Promise<void> {
  const { error } = await supabase.from('interactions').delete().eq('id', id)
  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
}

/** Inserta una tarea CRM. */
export async function createCrmTask(row: CrmTaskInsert): Promise<CrmTask> {
  const { data, error } = await supabase.from('tasks').insert(row).select('*').single()

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return data as CrmTask
}

/** Actualiza una tarea (p. ej. estado o `completed_at`). */
export async function updateCrmTask(id: string, patch: CrmTaskUpdate): Promise<CrmTask> {
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select('*').single()

  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
  return data as CrmTask
}

export async function deleteCrmTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) {
    if (missingTableError(error)) {
      throw new Error(
        'Falta crear las tablas en Supabase. Ejecute supabase/sql/interactions_v2_tables.sql.',
      )
    }
    throw new Error(error.message)
  }
}
