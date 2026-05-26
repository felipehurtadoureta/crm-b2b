import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { normalizeRut } from './siiAuth.ts'

export type SyncCount = { inserted: number; skipped: number; fetched: number }

const companyRutCache = new Map<string, string | null>()

export async function resolveCompanyId(
  admin: ReturnType<typeof createClient>,
  rut: string,
): Promise<string | null> {
  const key = normalizeRut(rut)
  if (!key) return null
  if (companyRutCache.has(key)) return companyRutCache.get(key) ?? null

  const { data } = await admin.from('companies').select('id, rut').not('rut', 'is', null)
  let found: string | null = null
  for (const row of data ?? []) {
    if (normalizeRut(String(row.rut ?? '')) === key) {
      found = row.id as string
      break
    }
  }
  companyRutCache.set(key, found)
  return found
}

export async function upsertIgnore<T extends { sii_import_hash: string }>(
  admin: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
): Promise<SyncCount> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, fetched: 0 }

  const hashes = rows.map(r => r.sii_import_hash)
  const existing = new Set<string>()
  const chunk = 80
  for (let i = 0; i < hashes.length; i += chunk) {
    const slice = hashes.slice(i, i + chunk)
    const { data } = await admin.from(table).select('sii_import_hash').in('sii_import_hash', slice)
    for (const row of data ?? []) existing.add(row.sii_import_hash as string)
  }

  const fresh = rows.filter(r => !existing.has(r.sii_import_hash))
  if (fresh.length === 0) {
    return { inserted: 0, skipped: rows.length, fetched: rows.length }
  }

  const { error } = await admin.from(table).insert(fresh)
  if (error) throw new Error(`${table}: ${error.message}`)

  return { inserted: fresh.length, skipped: rows.length - fresh.length, fetched: rows.length }
}
