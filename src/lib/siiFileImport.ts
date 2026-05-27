/**
 * Lee archivos RCV del SII (CSV o Excel) exportados desde el portal www.sii.cl.
 */
import * as XLSX from 'xlsx'
import { normalizeSiiRowDates, periodoToHintMonth } from '@/lib/siiDateParse'

export type SiiFileImportType = 'compras' | 'ventas' | 'honorarios'

export type ParsedSiiFile = {
  rows: Record<string, unknown>[]
  warnings: string[]
}

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isDataHeader(cells: unknown[]): boolean {
  const line = cells.map(normalizeHeaderCell).join(' ')
  if (line.includes('tipo doc') && line.includes('folio')) return true
  if (line.includes('folio') && (line.includes('rut proveedor') || line.includes('rut receptor'))) return true
  if (line.includes('numero boleta') || line.includes('nro boleta')) return true
  return false
}

function findHeaderRow(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 25); i++) {
    if (isDataHeader(matrix[i] ?? [])) return i
  }
  return 0
}

function rowToObject(headers: unknown[], values: unknown[]): Record<string, unknown> | null {
  const raw: Record<string, unknown> = {}
  let hasValue = false
  headers.forEach((h, i) => {
    const key = String(h ?? '').trim()
    if (!key) return
    const val = values[i]
    if (val != null && String(val).trim() !== '') hasValue = true
    raw[key] = val ?? ''
  })
  return hasValue ? raw : null
}

/** Parsea CSV/Excel del SII a filas con columnas originales. */
export async function parseSiiRcvFile(file: File, periodoHint?: string): Promise<ParsedSiiFile> {
  const warnings: string[] = []
  const hintMonth = periodoHint ? periodoToHintMonth(periodoHint) : null
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    throw new Error('Formato no válido. Use CSV, .xlsx o .xls exportado desde el SII.')
  }

  const buf = await file.arrayBuffer()
  const wb =
    ext === 'csv'
      ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', FS: ';', raw: false })
      : XLSX.read(buf, { type: 'array', cellDates: true, raw: false })

  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('El archivo no tiene hojas de datos.')

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  })

  if (matrix.length < 2) throw new Error('El archivo está vacío o solo tiene encabezados.')

  const headerIdx = findHeaderRow(matrix)
  if (headerIdx > 0) {
    warnings.push(`Se detectó encabezado en la fila ${headerIdx + 1}.`)
  }

  const headers = matrix[headerIdx] ?? []
  if (!isDataHeader(headers)) {
    throw new Error(
      'No se reconoce el formato RCV del SII. Verifique que sea la descarga de Compras o Ventas (debe incluir columnas «Tipo Doc» y «Folio»).',
    )
  }

  const rows: Record<string, unknown>[] = []
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const obj = rowToObject(headers, matrix[i] ?? [])
    if (obj) rows.push(normalizeSiiRowDates(obj, hintMonth))
  }

  if (rows.length === 0) throw new Error('No hay filas de documentos en el archivo.')

  return { rows, warnings }
}

export function fmtSiiImportSummary(r: { inserted: number; skipped: number; fetched: number }): string {
  if (r.inserted === 0 && r.skipped > 0) return `${r.skipped} filas ya estaban importadas.`
  const parts: string[] = []
  if (r.inserted) parts.push(`${r.inserted} nuevos`)
  if (r.skipped) parts.push(`${r.skipped} duplicados omitidos`)
  return parts.join(' · ') || 'Importación completada.'
}

/** Intenta deducir YYYY-MM desde el nombre del archivo (ej. RCV_2025-03.csv). */
export function guessPeriodoFromFilename(name: string): string | null {
  const base = name.replace(/\.[^.]+$/, '')
  const yymm = base.match(/(20\d{2})[-_./\s](0?[1-9]|1[0-2])(?:[^0-9]|$)/)
  if (yymm) return `${yymm[1]}-${yymm[2].padStart(2, '0')}`
  const compact = base.match(/(20\d{2})(0[1-9]|1[0-2])(?!\d)/)
  if (compact) return `${compact[1]}-${compact[2]}`
  return null
}

export type SiiFileEntry = {
  id: string
  file: File
  periodo: string
  rowCount: number | null
  warnings: string[]
  error: string | null
}

export async function buildSiiFileEntry(file: File, defaultPeriodo: string): Promise<SiiFileEntry> {
  const id = `${file.name}-${file.size}-${file.lastModified}`
  const periodo = guessPeriodoFromFilename(file.name) ?? defaultPeriodo
  try {
    const parsed = await parseSiiRcvFile(file, periodo)
    return {
      id,
      file,
      periodo,
      rowCount: parsed.rows.length,
      warnings: parsed.warnings,
      error: null,
    }
  } catch (e) {
    return {
      id,
      file,
      periodo,
      rowCount: null,
      warnings: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export type SiiBatchImportItem = {
  fileName: string
  periodo: string
  inserted: number
  skipped: number
  error?: string
}

export function fmtSiiBatchImportSummary(items: SiiBatchImportItem[]): string {
  const ok = items.filter(i => !i.error)
  const failed = items.filter(i => i.error)
  const inserted = ok.reduce((s, i) => s + i.inserted, 0)
  const skipped = ok.reduce((s, i) => s + i.skipped, 0)
  const parts: string[] = []
  if (ok.length) parts.push(`${ok.length} archivo(s) importado(s)`)
  if (inserted) parts.push(`${inserted} documentos nuevos`)
  if (skipped) parts.push(`${skipped} duplicados omitidos`)
  if (failed.length) parts.push(`${failed.length} con error`)
  return parts.join(' · ') || 'Importación completada.'
}
