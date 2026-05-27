/**
 * Fechas del RCV SII: CSV chileno DD/MM/YYYY y Excel (serial o display US m/d/yy).
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Serial Excel (días desde 1899-12-30) → YYYY-MM-DD UTC. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 30000 || serial > 60000) return null
  const utcMs = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(utcMs)
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

function resolveSlashDate(a: number, b: number, year: number, hintMonth: number | null): string | null {
  let candidates: { day: number; month: number }[] = []

  if (a > 12 && b <= 12) {
    candidates = [{ day: a, month: b }]
  } else if (b > 12 && a <= 12) {
    candidates = [{ day: b, month: a }]
  } else {
    // Ambiguo: probar DD/MM (SII Chile) y MM/DD (Excel US)
    candidates = [
      { day: a, month: b },
      { day: b, month: a },
    ]
  }

  const valid = candidates
    .map(c => ({ c, iso: toIsoDate(year, c.month, c.day) }))
    .filter((x): x is { c: { day: number; month: number }; iso: string } => x.iso != null)

  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0].iso

  if (hintMonth != null) {
    const byHint = valid.find(x => x.c.month === hintMonth)
    if (byHint) return byHint.iso
  }

  // Por defecto DD/MM (estándar SII en CSV)
  return valid[0].iso
}

/**
 * Convierte valor de celda/fecha SII a YYYY-MM-DD.
 * @param hintMonth Mes del período importado (1-12) para desambiguar fechas m/d.
 */
export function parseSiiDateValue(value: unknown, hintMonth: number | null = null): string | null {
  if (value == null || value === '') return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }

  if (typeof value === 'number') {
    return excelSerialToIso(value)
  }

  const s = String(value).trim()
  if (!s) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)

  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (ymd) return toIsoDate(+ymd[1], +ymd[2], +ymd[3])

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return resolveSlashDate(+dmy[1], +dmy[2], +dmy[3], hintMonth)

  const dmy2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (dmy2) return resolveSlashDate(+dmy2[1], +dmy2[2], 2000 + +dmy2[3], hintMonth)

  const serial = Number(s.replace(',', '.'))
  if (Number.isFinite(serial) && serial > 30000 && serial < 60000) return excelSerialToIso(serial)

  return null
}

export function parseSiiDateValueOrToday(value: unknown, hintMonth: number | null = null): string {
  return parseSiiDateValue(value, hintMonth) ?? new Date().toISOString().slice(0, 10)
}

const FECHA_HEADER_RE = /fecha/i

export function isSiiFechaHeader(header: string): boolean {
  return FECHA_HEADER_RE.test(header.trim())
}

/** Normaliza columnas de fecha en filas crudas del Excel/CSV antes de enviar al servidor. */
export function normalizeSiiRowDates(
  row: Record<string, unknown>,
  hintMonth: number | null = null,
): Record<string, unknown> {
  const out = { ...row }
  for (const key of Object.keys(out)) {
    if (!isSiiFechaHeader(key)) continue
    const parsed = parseSiiDateValue(out[key], hintMonth)
    if (parsed) out[key] = parsed
  }
  return out
}

export function periodoToHintMonth(periodo: string): number | null {
  const m = periodo.match(/^\d{4}-(\d{2})$/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  return month >= 1 && month <= 12 ? month : null
}
