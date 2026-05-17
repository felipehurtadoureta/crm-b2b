/**
 * Parser de cartola emitida Banco de Chile (.xls / .xlsx).
 * Formato: fila 0 = titular y cuenta; fila 1 = encabezados; resto = movimientos.
 */
import * as XLSX from 'xlsx'
import {
  buildCartolaDateContext,
  buildImportHash,
  normalizeAccountNumber,
  parseCartolaDate,
  parseChileanTextDate,
  parseChileanAmount,
  parseMdYyDisplay,
  type CartolaDateContext,
  type ParseCartolaDateOptions,
} from '@/lib/bankCartolaImportParseUtils'

export { buildImportHash, normalizeAccountNumber } from '@/lib/bankCartolaImportParseUtils'

export interface CartolaHeaderMeta {
  holderName: string | null
  holderRut: string | null
  accountNumber: string | null
}

export interface CartolaMovementDraft {
  rowNumber: number
  movementDate: string
  description: string
  debit: number
  credit: number
  balance: number | null
  documentNumber: string | null
  trn: string | null
  branch: string | null
  raw: Record<string, unknown>
  importHash: string
}

export interface ParsedCartola {
  meta: CartolaHeaderMeta
  movements: CartolaMovementDraft[]
  warnings: string[]
}

function normalizeHeaderCell(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function parseCartolaHeaderLine(line: string): CartolaHeaderMeta {
  const rutMatch = line.match(/\(([\d.\-kK]+)\)/)
  const ctaMatch = line.match(/cta:\s*(\d+)/i)
  let holderName: string | null = line.trim()
  if (rutMatch?.index != null) {
    holderName = line.slice(0, rutMatch.index).trim() || null
  }
  return {
    holderName: holderName || null,
    holderRut: rutMatch?.[1]?.trim() ?? null,
    accountNumber: normalizeAccountNumber(ctaMatch?.[1] ?? null),
  }
}

/** Fecha desde serial Excel, texto dd/mm/yyyy o display m/d/yy de cartola Banco de Chile. */
export function parseCartolaDateFromExcel(
  value: unknown,
  opts?: ParseCartolaDateOptions,
): string | null {
  if (value == null || value === '') return null

  const ctx = opts?.dateContext

  if (typeof value === 'string') {
    return parseChileanTextDate(value) ?? (ctx ? parseMdYyDisplay(value, ctx) : null)
  }

  if (opts?.formattedDisplay && ctx) {
    const fromDisplay = parseMdYyDisplay(opts.formattedDisplay, ctx)
    if (fromDisplay) return fromDisplay
  }

  if (typeof value === 'number' && Number.isFinite(value) && ctx) {
    const dc = XLSX.SSF.parse_date_code(value)
    if (dc?.y && dc?.m && dc?.d) {
      const dominant = ctx.dominantMonth
      if (
        dominant != null &&
        dc.d === 11 &&
        dc.m >= 1 &&
        dc.m <= 11 &&
        ctx.months.has(dominant) &&
        dc.m === dominant - 1
      ) {
        return `${dc.y}-${String(dominant).padStart(2, '0')}-${String(dc.m).padStart(2, '0')}`
      }
    }
  }

  return parseCartolaDate(value, opts)
}

export { parseCartolaDate } from '@/lib/bankCartolaImportParseUtils'

function findHeaderRowIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] ?? []).map(normalizeHeaderCell)
    if (cells.includes('fecha') && (cells.includes('detalle movimiento') || cells.some(c => c.includes('detalle')))) {
      return i
    }
  }
  return -1
}

export function parseCartolaEmitidaFromArrayBuffer(buf: ArrayBuffer): ParsedCartola {
  const emptyMeta: CartolaHeaderMeta = { holderName: null, holderRut: null, accountNumber: null }

  const wbFull = XLSX.read(buf, { type: 'array', cellNF: true })
  const sheetName = wbFull.SheetNames[0]
  if (!sheetName) {
    return { meta: emptyMeta, movements: [], warnings: ['El archivo no tiene hojas.'] }
  }

  const ws = wbFull.Sheets[sheetName]!
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][]

  const warnings: string[] = []
  const line0 = String(matrix[0]?.[0] ?? '').trim()
  const meta: CartolaHeaderMeta = line0 ? parseCartolaHeaderLine(line0) : emptyMeta

  if (!meta.accountNumber) {
    warnings.push('No se detectó número de cuenta (cta:…) en la primera fila.')
  }

  const headerIdx = findHeaderRowIndex(matrix)
  if (headerIdx < 0) {
    return {
      meta,
      movements: [],
      warnings: [...warnings, 'No se encontró fila de encabezados (Fecha, Detalle Movimiento, …).'],
    }
  }

  const headerCells = (matrix[headerIdx] ?? []).map(c => String(c ?? '').trim())
  const colIndex = (labels: string[]): number => {
    for (let i = 0; i < headerCells.length; i++) {
      const h = normalizeHeaderCell(headerCells[i])
      if (labels.some(l => h === normalizeHeaderCell(l) || h.includes(normalizeHeaderCell(l)))) {
        return i
      }
    }
    return -1
  }

  const iFecha = colIndex(['Fecha'])
  const iDetalle = colIndex(['Detalle Movimiento', 'Detalle'])
  const iCargo = colIndex(['Cheque o Cargo', 'Cargo'])
  const iAbono = colIndex(['Deposito o Abono', 'Depósito o Abono', 'Abono'])
  const iSaldo = colIndex(['Saldo'])
  const iDocto = colIndex(['Docto. Nro.', 'Docto'])
  const iTrn = colIndex(['Trn'])
  const iSucursal = colIndex(['Sucursal', 'Caja'])

  if (iFecha < 0 || iDetalle < 0) {
    return {
      meta,
      movements: [],
      warnings: [...warnings, 'Faltan columnas obligatorias Fecha o Detalle Movimiento.'],
    }
  }

  const accountNumber = meta.accountNumber ?? 'sin-cuenta'
  const movements: CartolaMovementDraft[] = []
  const dateContext: CartolaDateContext = buildCartolaDateContext(matrix, iFecha, headerIdx, ws)

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    const fechaRaw = row[iFecha]
    const fechaCell = ws[XLSX.utils.encode_cell({ r, c: iFecha })]
    const dateOpts: ParseCartolaDateOptions = {
      dateContext,
      formattedDisplay: fechaCell?.w ?? null,
      numberFormat: fechaCell?.z != null ? String(fechaCell.z) : null,
    }
    const detalle = String(row[iDetalle] ?? '').trim()
    const debit = iCargo >= 0 ? parseChileanAmount(row[iCargo]) : 0
    const credit = iAbono >= 0 ? parseChileanAmount(row[iAbono]) : 0
    const balance = iSaldo >= 0 ? parseChileanAmount(row[iSaldo]) : null
    const documentNumber = iDocto >= 0 ? String(row[iDocto] ?? '').trim() || null : null
    const trn = iTrn >= 0 ? String(row[iTrn] ?? '').trim() || null : null
    const branch = iSucursal >= 0 ? String(row[iSucursal] ?? '').trim() || null : null

    if (!detalle && !debit && !credit) continue

    const movementDate = parseCartolaDateFromExcel(fechaRaw, dateOpts)
    if (!movementDate) {
      warnings.push(`Fila ${r + 1}: fecha no válida (${String(fechaRaw)}).`)
      continue
    }

    const raw: Record<string, unknown> = {}
    headerCells.forEach((h, ci) => {
      if (h) raw[h] = row[ci]
    })

    const description = detalle || 'Sin descripción'
    const importHash = buildImportHash(
      accountNumber,
      movementDate,
      description,
      debit,
      credit,
      balance || null,
      documentNumber,
    )

    movements.push({
      rowNumber: r + 1,
      movementDate,
      description,
      debit,
      credit,
      balance: balance || null,
      documentNumber,
      trn,
      branch,
      raw,
      importHash,
    })
  }

  return { meta, movements, warnings }
}

/** Cartola emitida desde Excel (.xls / .xlsx). */
export async function parseCartolaEmitidaFromFile(
  buf: ArrayBuffer,
  _fileName: string,
): Promise<ParsedCartola> {
  return parseCartolaEmitidaFromArrayBuffer(buf)
}

/** RUT normalizado para comparar titular entre cartolas. */
export function normalizeHolderRut(rut: string | null | undefined): string {
  return (rut ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/-/g, '')
}

/** Clave de empresa para validar lote de cartolas (mismo titular). */
export function companyIdentityKey(meta: CartolaHeaderMeta): string {
  const rut = normalizeHolderRut(meta.holderRut)
  if (rut) return `rut:${rut}`
  const name = (meta.holderName ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (name) return `name:${name}`
  const acc = (meta.accountNumber ?? '').trim()
  return acc ? `cta:${acc}` : 'desconocido'
}

export function companyIdentityLabel(meta: CartolaHeaderMeta): string {
  const parts = [meta.holderName, meta.holderRut ? `(${meta.holderRut})` : null].filter(Boolean)
  return parts.join(' ') || meta.accountNumber || 'Empresa no identificada'
}

export interface CartolaFileParseResult {
  fileName: string
  parsed: ParsedCartola
}

/** Valida que todas las cartolas pertenezcan a la misma empresa. */
export function validateSameCompanyCartolas(
  items: CartolaFileParseResult[],
): { ok: true; companyKey: string; companyLabel: string } | { ok: false; message: string } {
  if (items.length === 0) {
    return { ok: false, message: 'No hay archivos para importar.' }
  }

  const keys = items.map(i => ({
    fileName: i.fileName,
    key: companyIdentityKey(i.parsed.meta),
    label: companyIdentityLabel(i.parsed.meta),
  }))

  const unique = new Map<string, string[]>()
  for (const { fileName, key, label } of keys) {
    if (!unique.has(key)) unique.set(key, [])
    unique.get(key)!.push(`${fileName} (${label})`)
  }

  if (unique.size > 1) {
    const detalle = [...unique.entries()]
      .map(([key, files]) => `• ${key}: ${files.join(', ')}`)
      .join('\n')
    return {
      ok: false,
      message: `Las cartolas no son de la misma empresa. No se importó nada.\n\n${detalle}`,
    }
  }

  const first = items[0]!
  return {
    ok: true,
    companyKey: keys[0]!.key,
    companyLabel: companyIdentityLabel(first.parsed.meta),
  }
}
