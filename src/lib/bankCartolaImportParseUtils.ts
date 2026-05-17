/**
 * Utilidades compartidas entre importación Excel y PDF de cartolas.
 */
import * as XLSX from 'xlsx'

export function normalizeAccountNumber(acc: string | null | undefined): string | null {
  if (!acc) return null
  const digits = acc.replace(/\D/g, '')
  if (!digits) return null
  return digits.replace(/^0+/, '') || digits
}

export function parseChileanAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(value)
  const s = String(value ?? '')
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
  if (!s) return 0
  const neg = s.startsWith('-') || s.includes('(')
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  if (!Number.isFinite(n)) return 0
  return neg ? -Math.abs(n) : Math.abs(n)
}

export function buildImportHash(
  accountNumber: string,
  date: string,
  description: string,
  debit: number,
  credit: number,
  balance: number | null,
  documentNumber: string | null,
): string {
  const bal = balance == null ? '' : String(balance)
  const doc = documentNumber ?? ''
  return [accountNumber, date, description.trim(), debit, credit, bal, doc].join('|')
}

/** Meses y años detectados en la cartola (fechas texto y seriales). */
export interface CartolaDateContext {
  years: Set<number>
  months: Set<number>
  dominantMonth: number | null
  dominantYear: number | null
}

export interface ParseCartolaDateOptions {
  dateContext?: CartolaDateContext
  /** Valor mostrado en Excel (celda.w), p. ej. "1/11/25" */
  formattedDisplay?: string | null
  /** Formato numérico de celda (celda.z), p. ej. "m/d/yy" */
  numberFormat?: string | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function addMonthYear(ctx: CartolaDateContext, year: number, month: number): void {
  if (month >= 1 && month <= 12) ctx.months.add(month)
  if (year >= 1900) ctx.years.add(year)
}

/**
 * Cartolas solo con seriales m/d/yy: el 2.º número suele ser mes-1 (11 = diciembre).
 * Si el 1.º es 12, es diciembre en formato US (12/1/24).
 */
function inferDominantMonthFromSerialDisplays(
  rows: unknown[][],
  fechaCol: number,
  headerIdx: number,
  ws: XLSX.WorkSheet | undefined,
  ctx: CartolaDateContext,
): void {
  if (ctx.months.size > 0 || !ws) return

  const secondCounts = new Map<number, number>()
  let hasMonth12Prefix = false

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: fechaCol })]
    const w = cell?.w != null ? String(cell.w).trim() : ''
    if (!w) continue

    const m = w.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
    if (!m) continue

    const a = parseInt(m[1]!, 10)
    const b = parseInt(m[2]!, 10)
    if (a === 12 && b <= 31) {
      hasMonth12Prefix = true
      const yy = parseInt(m[3]!, 10)
      const year = m[3]!.length <= 2 ? 2000 + yy : yy
      addMonthYear(ctx, year, 12)
    }
    secondCounts.set(b, (secondCounts.get(b) ?? 0) + 1)
  }

  if (hasMonth12Prefix) return

  let bestB = 0
  let bestCount = 0
  for (const [b, c] of secondCounts) {
    if (c > bestCount) {
      bestCount = c
      bestB = b
    }
  }

  if (bestCount >= 2 && bestB >= 10 && bestB <= 11) {
    ctx.months.add(bestB + 1)
  }
}

function finalizeDateContext(ctx: CartolaDateContext): void {
  const monthCounts = new Map<number, number>()
  for (const m of ctx.months) monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1)
  let bestMonth = 0
  let bestCount = 0
  for (const [m, c] of monthCounts) {
    if (c > bestCount) {
      bestCount = c
      bestMonth = m
    }
  }
  ctx.dominantMonth = bestMonth || null
  ctx.dominantYear = ctx.years.size ? Math.max(...ctx.years) : null
}

/** Construye contexto de fechas recorriendo la columna Fecha del Excel. */
export function buildCartolaDateContext(
  rows: unknown[][],
  fechaCol: number,
  headerIdx: number,
  ws?: XLSX.WorkSheet,
): CartolaDateContext {
  const ctx: CartolaDateContext = {
    years: new Set(),
    months: new Set(),
    dominantMonth: null,
    dominantYear: null,
  }

  // Paso 1: fechas texto dd/mm/aaaa (referencia fiable del período)
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const raw = rows[r]?.[fechaCol]
    if (typeof raw !== 'string') continue
    const iso = parseChileanTextDate(raw.trim())
    if (iso) {
      const [, y, m] = iso.match(/^(\d{4})-(\d{2})/) ?? []
      if (y && m) addMonthYear(ctx, parseInt(y, 10), parseInt(m, 10))
    }
  }

  inferDominantMonthFromSerialDisplays(rows, fechaCol, headerIdx, ws, ctx)
  finalizeDateContext(ctx)

  // Paso 2: seriales / display con mes dominante ya inferido
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const raw = rows[r]?.[fechaCol]
    if (raw == null || raw === '') continue
    if (typeof raw === 'string') continue

    const cell = ws?.[XLSX.utils.encode_cell({ r, c: fechaCol })]
    const display = cell?.w != null ? String(cell.w).trim() : ''

    if (display) {
      const iso = parseMdYyDisplay(display, ctx)
      if (iso) {
        const [, y, m] = iso.match(/^(\d{4})-(\d{2})/) ?? []
        if (y && m) addMonthYear(ctx, parseInt(y, 10), parseInt(m, 10))
      }
    }
  }

  finalizeDateContext(ctx)
  return ctx
}

/** Fecha dd/mm/aaaa o dd/mm/aaaa explícita (siempre día primero en Chile). */
export function parseChileanTextDate(value: string): string | null {
  const s = value.trim()
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m1) {
    const day = parseInt(m1[1]!, 10)
    const month = parseInt(m1[2]!, 10)
    const year = parseInt(m1[3]!, 10)
    return toIsoDate(year, month, day)
  }
  const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (m2) {
    return toIsoDate(parseInt(m2[1]!, 10), parseInt(m2[2]!, 10), parseInt(m2[3]!, 10))
  }
  return null
}

/**
 * Fecha corta del export Banco de Chile (celda.w con z m/d/yy).
 * Puede ser US (12/1/24 = 1 dic) o día/mes con mes desfasado (1/11/25 = 1 dic).
 */
export function parseMdYyDisplay(display: string, ctx: CartolaDateContext): string | null {
  const s = display.trim()
  const full = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (full) {
    const a = parseInt(full[1]!, 10)
    const b = parseInt(full[2]!, 10)
    const year = parseInt(full[3]!, 10)
    if (b === 12 || a > 12) return toIsoDate(year, b, a)
    return pickShortDate(a, b, year, ctx)
  }

  const short = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (short) {
    const a = parseInt(short[1]!, 10)
    const b = parseInt(short[2]!, 10)
    const yy = parseInt(short[3]!, 10)
    const year = yy < 100 ? 2000 + yy : yy
    return pickShortDate(a, b, year, ctx)
  }

  return null
}

function pickShortDate(a: number, b: number, year: number, ctx: CartolaDateContext): string | null {
  const dominant = ctx.dominantMonth
  const months = ctx.months

  // US: mes 12, día b (ej. 12/1/24)
  if (a === 12 && b <= 31) {
    return toIsoDate(year, 12, b)
  }

  // Mes desfasado -1 en export (ej. 1/11/25 = 1 dic cuando la cartola es de diciembre)
  if (dominant != null && b === dominant - 1 && months.has(dominant) && a <= 31) {
    return toIsoDate(year, dominant, a)
  }

  const chilean = toIsoDate(year, b, a)
  const us = toIsoDate(year, a, b)

  if (months.has(b) && !months.has(a)) return chilean
  if (months.has(a) && !months.has(b)) return us
  if (dominant != null) {
    if (b === dominant) return chilean
    if (a === dominant) return us
  }

  return chilean
}

/** Fecha desde texto, display Excel o serial. */
export function parseCartolaDate(
  value: unknown,
  defaultYearOrOpts?: number | ParseCartolaDateOptions,
  maybeOpts?: ParseCartolaDateOptions,
): string | null {
  if (value == null || value === '') return null

  const opts: ParseCartolaDateOptions | undefined =
    typeof defaultYearOrOpts === 'number' ? maybeOpts : defaultYearOrOpts
  const defaultYear = typeof defaultYearOrOpts === 'number' ? defaultYearOrOpts : undefined
  const ctx: CartolaDateContext = opts?.dateContext ?? {
    years: new Set(),
    months: new Set(),
    dominantMonth: null,
    dominantYear: null,
  }

  if (opts?.formattedDisplay) {
    const fromDisplay = parseMdYyDisplay(opts.formattedDisplay, ctx)
    if (fromDisplay) return fromDisplay
  }

  const s = String(value).trim()

  const mShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (mShort && defaultYear) {
    const day = parseInt(mShort[1]!, 10)
    const month = parseInt(mShort[2]!, 10)
    return toIsoDate(defaultYear, month, day)
  }

  const fromText = parseChileanTextDate(s)
  if (fromText) return fromText

  const fromMd = parseMdYyDisplay(s, ctx)
  if (fromMd) return fromMd

  return null
}

/** Clasifica cargo/abono según descripción típica de cartola Banco de Chile. */
export function classifyMovementFromDescription(desc: string): 'debit' | 'credit' | null {
  const d = desc.toUpperCase().trim()

  if (/TRASPASO\s+DE:|^APP-TRASPASO\s+DE:/.test(d)) return 'credit'
  if (/TRASPASO\s+A:|^APP-TRASPASO\s+A:/.test(d)) return 'debit'
  if (/DEPOSITO|ABONO\b|INGRESO\b|REVERSO\s+COMISION/i.test(d)) return 'credit'
  if (/PAGO\s+EN\s+|COMISION|GIRO\b|CHEQUE|CARGO\b|HONORARIO/i.test(d)) return 'debit'
  if (/^PAGO:/.test(d)) return 'credit'

  return null
}

/**
 * Infiere cargo/abono comparando saldos (cartola suele ir de más reciente a más antiguo).
 * prevBalance = saldo de la fila siguiente (movimiento anterior en el tiempo).
 */
export function inferDebitCreditFromBalances(
  movementAmount: number,
  balance: number | null,
  prevBalance: number | null,
  description: string,
): { debit: number; credit: number } {
  if (movementAmount <= 0) return { debit: 0, credit: 0 }

  if (balance != null && prevBalance != null) {
    const delta = balance - prevBalance
    if (Math.abs(delta) >= 1) {
      if (delta > 0) return { debit: 0, credit: movementAmount }
      return { debit: movementAmount, credit: 0 }
    }
  }

  const kind = classifyMovementFromDescription(description)
  if (kind === 'credit') return { debit: 0, credit: movementAmount }
  if (kind === 'debit') return { debit: movementAmount, credit: 0 }

  return { debit: movementAmount, credit: 0 }
}
