/**
 * Conexiones SII (metadata en Postgres; clave solo vía Edge Function).
 */
import { supabase } from '@/lib/supabase'
import { SII_SETUP_HINT } from '@/lib/siiSync'
import type { SiiConnection } from '@/types'

export const SII_CONNECTIONS_QUERY_KEY = ['sii-connections'] as const

function isMissingTable(msg: string): boolean {
  return msg.includes('42P01') || /sii_connections/i.test(msg)
}

export async function fetchSiiConnections(): Promise<SiiConnection[]> {
  const { data, error } = await supabase
    .from('sii_connections')
    .select(
      'id, rut, legal_name, provider, is_active, initial_sync_months, last_sync_at, last_sync_compras_at, last_sync_ventas_at, last_sync_honorarios_at, created_at, updated_at',
    )
    .order('legal_name')

  if (error) {
    if (isMissingTable(error.message)) throw new Error(SII_SETUP_HINT)
    throw new Error(error.message)
  }

  return (data ?? []) as SiiConnection[]
}

export function fmtSiiLastSync(iso: string | null | undefined): string {
  if (!iso) return 'Nunca'
  try {
    return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}
