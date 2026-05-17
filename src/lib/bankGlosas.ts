/**
 * Glosas contables del libro de banco y sugerencias por descripción.
 */
import { supabase } from '@/lib/supabase'

export const BANK_GLOSAS_SETUP_HINT =
  'Faltan las glosas. Ejecute supabase/sql/bank_glosas.sql en el SQL Editor de Supabase.'

export interface BankGlosa {
  id: string
  code: string
  name: string
  match_keywords: string[]
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export const BANK_GLOSAS_QUERY_KEY = ['bank-glosas'] as const

function normalizeMatchText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mapBankGlosaRow(row: Record<string, unknown>): BankGlosa {
  const kw = row.match_keywords
  return {
    id: row.id as string,
    code: String(row.code ?? '').trim(),
    name: String(row.name ?? '').trim(),
    match_keywords: Array.isArray(kw) ? kw.map(String) : [],
    sort_order: Number(row.sort_order) || 100,
    is_active: row.is_active !== false,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function fetchBankGlosas(opts?: { activeOnly?: boolean }): Promise<BankGlosa[]> {
  let q = supabase.from('bank_glosas').select('*').order('sort_order').order('code')
  if (opts?.activeOnly !== false) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) {
    if (error.code === '42P01') throw new Error(BANK_GLOSAS_SETUP_HINT)
    throw new Error(error.message)
  }
  return (data ?? []).map(r => mapBankGlosaRow(r as Record<string, unknown>))
}

/** Sugiere código de glosa según palabras clave configuradas. */
export function suggestGlosaCode(description: string, glosas: BankGlosa[]): string | null {
  const norm = normalizeMatchText(description)
  if (!norm) return null

  let best: { code: string; score: number } | null = null

  for (const g of glosas) {
    if (!g.is_active) continue
    for (const rawKw of g.match_keywords) {
      const kw = normalizeMatchText(rawKw)
      if (!kw || kw.length < 2) continue
      if (!norm.includes(kw)) continue

      const score = kw.length * 100 - g.sort_order
      if (!best || score > best.score) {
        best = { code: g.code, score }
      }
    }
  }

  return best?.code ?? null
}

export function bankGlosaLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return code
}

export interface BankGlosaInput {
  code: string
  name: string
  match_keywords: string[]
  sort_order: number
  is_active: boolean
}

export async function createBankGlosa(input: BankGlosaInput): Promise<BankGlosa> {
  const { data, error } = await supabase
    .from('bank_glosas')
    .insert({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      match_keywords: input.match_keywords.map(k => k.trim()).filter(Boolean),
      sort_order: input.sort_order,
      is_active: input.is_active,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapBankGlosaRow(data as Record<string, unknown>)
}

export async function updateBankGlosa(id: string, input: BankGlosaInput): Promise<void> {
  const { error } = await supabase
    .from('bank_glosas')
    .update({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      match_keywords: input.match_keywords.map(k => k.trim()).filter(Boolean),
      sort_order: input.sort_order,
      is_active: input.is_active,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function deleteBankGlosa(id: string): Promise<void> {
  const { error } = await supabase.from('bank_glosas').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
