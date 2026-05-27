/**
 * Libro de banco — consultas e importación Supabase.
 */
import { supabase } from '@/lib/supabase'
import type { CartolaFileParseResult, ParsedCartola } from '@/lib/bankCartolaImport'
import { validateSameCompanyCartolas } from '@/lib/bankCartolaImport'
import type { BankAccount, BankTransaction } from '@/types'

export const BANK_BOOK_SETUP_HINT =
  'Faltan las tablas de banco. Ejecute supabase/sql/bank_book.sql en el SQL Editor de Supabase.'

export type BankTransactionRow = BankTransaction & {
  bank_accounts: Pick<BankAccount, 'account_number' | 'account_label' | 'holder_name'> | null
}

export type CartolaDuplicateStatus = 'new' | 'partial' | 'duplicate'

export interface CartolaDuplicateInfo {
  status: CartolaDuplicateStatus
  existingCount: number
  total: number
}

export interface ImportCartolaResult {
  accountId: string
  inserted: number
  skipped: number
  errors: string[]
  /** Toda la cartola ya estaba en el libro (ningún movimiento nuevo). */
  duplicateCartola: boolean
}

export interface ImportMultipleCartolasResult {
  filesProcessed: number
  filesImported: number
  inserted: number
  skipped: number
  /** Cartolas omitidas por estar ya importadas o repetidas en el lote. */
  duplicateCartolas: string[]
  errors: string[]
}

/** Consulta qué movimientos (por hash) ya existen en Supabase. */
export async function findExistingImportHashes(hashes: string[]): Promise<Set<string>> {
  const unique = [...new Set(hashes)]
  if (unique.length === 0) return new Set()

  const existing = new Set<string>()
  const chunkSize = 80

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('import_hash')
      .in('import_hash', chunk)

    if (error) {
      if (error.code === '42P01') throw new Error(BANK_BOOK_SETUP_HINT)
      throw new Error(error.message)
    }
    for (const row of data ?? []) {
      const h = row.import_hash as string | undefined
      if (h) existing.add(h)
    }
  }

  return existing
}

export function getCartolaDuplicateStatus(
  parsed: ParsedCartola,
  existingHashes: Set<string>,
): CartolaDuplicateInfo {
  const total = parsed.movements.length
  const existingCount = parsed.movements.filter(m => existingHashes.has(m.importHash)).length
  if (total === 0) return { status: 'new', existingCount: 0, total: 0 }
  if (existingCount === 0) return { status: 'new', existingCount: 0, total }
  if (existingCount >= total) return { status: 'duplicate', existingCount, total }
  return { status: 'partial', existingCount, total }
}

/** Huella de una cartola para detectar el mismo archivo en un lote. */
export function cartolaFingerprint(parsed: ParsedCartola): string {
  const hashes = parsed.movements.map(m => m.importHash).sort()
  return hashes.join('\n')
}

/** Archivos repetidos dentro del mismo lote (mismo contenido). */
export function findIntraBatchDuplicateFiles(
  items: CartolaFileParseResult[],
): Map<string, string> {
  const seen = new Map<string, string>()
  const dup = new Map<string, string>()

  for (const { fileName, parsed } of items) {
    if (parsed.movements.length === 0) continue
    const fp = cartolaFingerprint(parsed)
    const first = seen.get(fp)
    if (first) {
      dup.set(fileName, first)
    } else {
      seen.set(fp, fileName)
    }
  }

  return dup
}

async function upsertBankAccount(meta: ParsedCartola['meta']): Promise<string> {
  const accountNumber = meta.accountNumber?.trim()
  if (!accountNumber) throw new Error('La cartola no incluye número de cuenta.')

  const payload = {
    bank_name: 'Banco de Chile',
    account_number: accountNumber,
    account_label: meta.holderName ? `Cta ${accountNumber}` : null,
    holder_name: meta.holderName,
    holder_rut: meta.holderRut,
    currency: 'CLP',
  }

  const { data, error } = await supabase
    .from('bank_accounts')
    .upsert(payload, { onConflict: 'bank_name,account_number' })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  if (!data?.id) throw new Error('No se pudo registrar la cuenta bancaria.')
  return data.id as string
}

/** Último día del mes YYYY-MM */
export function lastDayOfMonthYm(ym: string): string {
  const [y, m] = ym.split('-')
  if (!y || !m) return ym
  const lastDay = new Date(Number(y), Number(m), 0).getDate()
  return `${y}-${m}-${String(lastDay).padStart(2, '0')}`
}

export async function fetchBankTransactions(opts?: {
  accountId?: string
  /** Un solo mes (compatibilidad) */
  month?: string
  /** Rango inclusive YYYY-MM-DD */
  dateFrom?: string
  dateTo?: string
  limit?: number
}): Promise<BankTransactionRow[]> {
  let q = supabase
    .from('bank_transactions')
    .select(
      '*, bank_accounts(account_number, account_label, holder_name)',
    )
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 2000)

  if (opts?.accountId) q = q.eq('bank_account_id', opts.accountId)

  if (opts?.dateFrom) q = q.gte('movement_date', opts.dateFrom)
  if (opts?.dateTo) q = q.lte('movement_date', opts.dateTo)

  if (!opts?.dateFrom && !opts?.dateTo && opts?.month) {
    const start = `${opts.month}-01`
    const end = lastDayOfMonthYm(opts.month)
    q = q.gte('movement_date', start).lte('movement_date', end)
  }

  const { data, error } = await q
  if (error) {
    if (error.code === '42P01') throw new Error(`${BANK_BOOK_SETUP_HINT} (${error.message})`)
    throw new Error(error.message)
  }
  return (data ?? []) as BankTransactionRow[]
}

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .order('account_number')

  if (error) {
    if (error.code === '42P01') throw new Error(BANK_BOOK_SETUP_HINT)
    throw new Error(error.message)
  }
  return (data ?? []) as BankAccount[]
}

export async function importCartolaToSupabase(
  parsed: ParsedCartola,
  importedBy: string,
  opts?: { existingHashes?: Set<string> },
): Promise<ImportCartolaResult> {
  const accountId = await upsertBankAccount(parsed.meta)
  const errors: string[] = []
  let inserted = 0
  let skipped = 0

  const existing = opts?.existingHashes
  if (existing && parsed.movements.length > 0) {
    const allDup = parsed.movements.every(m => existing.has(m.importHash))
    if (allDup) {
      return {
        accountId,
        inserted: 0,
        skipped: parsed.movements.length,
        errors: [],
        duplicateCartola: true,
      }
    }
  }

  for (const mov of parsed.movements) {
    if (existing?.has(mov.importHash)) {
      skipped++
      continue
    }
    const row = {
      bank_account_id: accountId,
      movement_date: mov.movementDate,
      description: mov.description,
      debit: mov.debit,
      credit: mov.credit,
      balance: mov.balance,
      document_number: mov.documentNumber,
      trn: mov.trn,
      branch: mov.branch,
      import_hash: mov.importHash,
      raw: mov.raw,
      imported_by: importedBy,
      glosa: null,
    }

    const { error } = await supabase.from('bank_transactions').insert(row)
    if (error) {
      if (error.code === '23505') {
        skipped++
        continue
      }
      errors.push(`Fila ${mov.rowNumber}: ${error.message}`)
      continue
    }
    inserted++
    existing?.add(mov.importHash)
  }

  return { accountId, inserted, skipped, errors, duplicateCartola: false }
}

/** Importa varias cartolas solo si todas son de la misma empresa. */
export async function importMultipleCartolasToSupabase(
  items: CartolaFileParseResult[],
  importedBy: string,
): Promise<ImportMultipleCartolasResult> {
  const check = validateSameCompanyCartolas(items)
  if (!check.ok) throw new Error(check.message)

  const intraBatchDup = findIntraBatchDuplicateFiles(items)
  const allHashes = items.flatMap(i => i.parsed.movements.map(m => m.importHash))
  const existingHashes = await findExistingImportHashes(allHashes)

  let inserted = 0
  let skipped = 0
  let filesImported = 0
  const errors: string[] = []
  const duplicateCartolas: string[] = []

  for (const { fileName, parsed } of items) {
    if (parsed.movements.length === 0) {
      errors.push(`${fileName}: sin movimientos.`)
      continue
    }

    const batchTwin = intraBatchDup.get(fileName)
    if (batchTwin) {
      duplicateCartolas.push(`${fileName} (misma cartola que ${batchTwin})`)
      continue
    }

    const dupInfo = getCartolaDuplicateStatus(parsed, existingHashes)
    if (dupInfo.status === 'duplicate') {
      duplicateCartolas.push(`${fileName} (ya importada)`)
      continue
    }

    const one = await importCartolaToSupabase(parsed, importedBy, { existingHashes })
    if (one.duplicateCartola) {
      duplicateCartolas.push(`${fileName} (ya importada)`)
      continue
    }

    filesImported++
    inserted += one.inserted
    skipped += one.skipped
    for (const e of one.errors) {
      errors.push(`${fileName}: ${e}`)
    }
  }

  return {
    filesProcessed: items.length,
    filesImported,
    inserted,
    skipped,
    duplicateCartolas,
    errors,
  }
}

export async function updateTransactionGlosa(
  transactionId: string,
  glosa: string | null,
): Promise<void> {
  const patch: {
    glosa: string | null
    sii_purchase_document_id?: null
    sii_sales_document_id?: null
  } = {
    glosa: glosa || null,
  }
  if (glosa !== 'FC') patch.sii_purchase_document_id = null
  if (glosa !== 'FV') patch.sii_sales_document_id = null

  const { error } = await supabase.from('bank_transactions').update(patch).eq('id', transactionId)

  if (error) {
    if (error.code === '42703') {
      throw new Error(
        'Falta la columna glosa. Ejecute supabase/sql/bank_book_glosa.sql en Supabase.',
      )
    }
    throw new Error(error.message)
  }
}

export async function updateTransactionNotes(
  transactionId: string,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ notes: notes || null })
    .eq('id', transactionId)

  if (error) {
    if (error.code === '42703') {
      throw new Error(
        'Falta la columna notes. Ejecute supabase/sql/bank_book_notes.sql en Supabase.',
      )
    }
    throw new Error(error.message)
  }
}

export async function linkTransactionToInvoice(
  transactionId: string,
  invoiceId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('bank_transactions')
    .update({ invoice_id: invoiceId })
    .eq('id', transactionId)

  if (error) throw new Error(error.message)
}
