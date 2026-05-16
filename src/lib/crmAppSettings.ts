import { supabase } from '@/lib/supabase'
import { CRM_COMPANY_DEFAULTS } from '@/config/company'

/** Fila en Supabase (snake_case). */
export interface CrmAppSettingsRow {
  id: number
  display_name: string
  tagline: string | null
  legal_name: string | null
  rut: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  updated_at: string
}

/** Forma unificada para UI e impresión. */
export interface CrmAppSettingsMerged {
  displayName: string
  tagline: string
  legalName: string
  rut: string
  address: string
  phone: string
  email: string
  website: string
  logoUrl: string | null
}

export function mergeCrmAppSettings(row: CrmAppSettingsRow | null): CrmAppSettingsMerged {
  const d = CRM_COMPANY_DEFAULTS
  if (!row) {
    return {
      displayName: d.displayName,
      tagline: d.tagline,
      legalName: d.legalName,
      rut: d.rut,
      address: d.address,
      phone: d.phone,
      email: d.email,
      website: d.website,
      logoUrl: null,
    }
  }
  return {
    displayName: row.display_name?.trim() || d.displayName,
    tagline: (row.tagline ?? '').trim() || d.tagline,
    legalName: (row.legal_name ?? '').trim() || d.legalName,
    rut: (row.rut ?? '').trim() || d.rut,
    address: (row.address ?? '').trim() || d.address,
    phone: (row.phone ?? '').trim() || d.phone,
    email: (row.email ?? '').trim() || d.email,
    website: (row.website ?? '').trim() || d.website,
    logoUrl: row.logo_url?.trim() || null,
  }
}

export async function fetchCrmAppSettingsMerged(): Promise<CrmAppSettingsMerged> {
  const { data, error } = await supabase.from('crm_app_settings').select('*').eq('id', 1).maybeSingle()
  if (error) {
    const missing = error.message.includes('relation') || error.code === '42P01'
    if (missing) return mergeCrmAppSettings(null)
    throw new Error(error.message)
  }
  return mergeCrmAppSettings(data as CrmAppSettingsRow | null)
}

/** Objeto tipo `COMPANY` para plantillas que esperan { name, rut, ... }. */
export function mergedToPrintIssuer(m: CrmAppSettingsMerged) {
  return {
    name: m.legalName,
    rut: m.rut,
    address: m.address,
    phone: m.phone,
    email: m.email,
    website: m.website,
  }
}
