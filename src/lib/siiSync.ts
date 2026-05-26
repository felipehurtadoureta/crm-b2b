/**
 * Invocación de Edge Functions SII (conexiones e importación por archivo).
 */
import { supabase } from '@/lib/supabase'
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import type { SiiConnection } from '@/types'

export const SII_SETUP_HINT =
  'Faltan las tablas SII. Ejecute supabase/sql/sii_documents.sql en el SQL Editor de Supabase.'

export type SiiImportType = 'compras' | 'ventas' | 'honorarios'

export type SiiConnectionUpsertInput = {
  id?: string
  rut: string
  legal_name: string
  is_active?: boolean
  initial_sync_months?: number
}

async function formatFunctionError(err: unknown, fnName: string): Promise<string> {
  if (err instanceof FunctionsFetchError) {
    return [
      `No se pudo conectar con la función ${fnName}.`,
      'Revise que esté desplegada (`supabase functions deploy ' + fnName + '`) y la conexión a Supabase.',
    ].join(' ')
  }
  if (err instanceof FunctionsRelayError) {
    return err.message
  }
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response | undefined
    const status = res?.status
    try {
      const j = (await res?.json()) as { error?: string; message?: string }
      if (j?.error) return j.error
      if (j?.message) return j.message
    } catch {
      /* ignore */
    }
    if (status === 404) {
      return [
        `La función Edge «${fnName}» no está desplegada en Supabase (HTTP 404).`,
        `Despliegue con: supabase functions deploy ${fnName}`,
      ].join(' ')
    }
    return `Error HTTP ${status ?? ''} al llamar ${fnName}`.trim()
  }
  return err instanceof Error ? err.message : String(err)
}

export type SiiImportResult = {
  ok: boolean
  import_type: SiiImportType
  periodo: string
  inserted: number
  skipped: number
  fetched: number
  error?: string
}

export async function invokeSiiImport(input: {
  connection_id: string
  import_type: SiiImportType
  periodo: string
  rows: Record<string, unknown>[]
  tipo_boleta?: 'BHE' | 'BTE'
}): Promise<SiiImportResult> {
  const { data, error } = await supabase.functions.invoke('sii-import', { body: input })
  if (error) throw new Error(await formatFunctionError(error, 'sii-import'))
  const payload = data as SiiImportResult | { error?: string }
  if (payload && 'error' in payload && payload.error) {
    throw new Error(payload.error)
  }
  return payload as SiiImportResult
}

export async function invokeSiiConnectionUpsert(
  input: SiiConnectionUpsertInput & { action?: 'upsert' | 'delete' },
): Promise<{ connection: SiiConnection }> {
  const { data, error } = await supabase.functions.invoke('sii-connection', {
    body: { action: 'upsert', ...input },
  })
  if (error) throw new Error(await formatFunctionError(error, 'sii-connection'))
  const payload = data as { ok?: boolean; error?: string; connection?: SiiConnection }
  if (payload.error) throw new Error(payload.error)
  if (!payload.connection) throw new Error('Respuesta inválida del servidor')
  return { connection: payload.connection }
}

export async function invokeSiiConnectionDelete(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('sii-connection', {
    body: { action: 'delete', id },
  })
  if (error) throw new Error(await formatFunctionError(error, 'sii-connection'))
  const payload = data as { error?: string }
  if (payload?.error) throw new Error(payload.error)
}
