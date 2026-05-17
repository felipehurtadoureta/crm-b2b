/**
 * Parser de cartola emitida Banco de Chile en PDF.
 */
import '@/lib/pdfjsSetup'
import { getDocument } from 'pdfjs-dist'
import { parseCartolaDate, type CartolaHeaderMeta, type CartolaMovementDraft, type ParsedCartola } from '@/lib/bankCartolaImport'
import {
  buildImportHash,
  inferDebitCreditFromBalances,
  normalizeAccountNumber,
  parseChileanTextDate,
} from '@/lib/bankCartolaImportParseUtils'

const BRANCHES = ['INTERNET', 'CENTRAL', 'OFICINA NUEVA APOQUINDO EDWARD'] as const

const emptyMeta: CartolaHeaderMeta = { holderName: null, holderRut: null, accountNumber: null }

function parseChileanDots(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(/\s/g, '')
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : 0
}

async function extractPdfLines(buf: ArrayBuffer): Promise<string[]> {
  const data = new Uint8Array(buf)
  const pdf = await getDocument({ data }).promise
  const lines: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    let lastY: number | null = null
    let line = ''

    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        const t = line.replace(/\s+/g, ' ').trim()
        if (t) lines.push(t)
        line = ''
      }
      line += item.str + ' '
      lastY = y
    }
    const t = line.replace(/\s+/g, ' ').trim()
    if (t) lines.push(t)
  }

  return lines
}

function extractPeriodYear(lines: string[]): number {
  for (const l of lines) {
    const m = l.match(/\d{2}\/\d{2}\/(\d{4})\s+\d{2}\/\d{2}\/(\d{4})/)
    if (m) return parseInt(m[2]!, 10)
    const m2 = l.match(/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/(\d{4})/)
    if (m2) return parseInt(m2[1]!, 10)
  }
  return new Date().getFullYear()
}

function extractMetaFromPdfLines(lines: string[]): CartolaHeaderMeta {
  let holderName: string | null = null
  let holderRut: string | null = null
  let accountNumber: string | null = null

  for (const l of lines) {
    const rutInLine = l.match(/\(([\d.\-kK]+)\)/)
    if (rutInLine && !holderRut) holderRut = rutInLine[1]!.trim()

    if (!holderName && /\b(S\.A\.|S\.A|LIMITADA|SPA|EIRL)\b/i.test(l) && l.length < 80) {
      holderName = l.trim()
    }

    if (!accountNumber && /^\d{10,14}$/.test(l.trim())) {
      accountNumber = normalizeAccountNumber(l.trim())
    }

    const cta = l.match(/cta:\s*(\d+)/i)
    if (cta) accountNumber = normalizeAccountNumber(cta[1]!)
  }

  if (!accountNumber) {
    for (const l of lines) {
      const m = l.match(/^0*(\d{10,12})\d{8}$/)
      if (m) {
        accountNumber = normalizeAccountNumber(m[1]!)
        break
      }
    }
  }

  return { holderName, holderRut, accountNumber }
}

interface PdfRowDraft {
  movementDate: string
  description: string
  branch: string | null
  debit: number
  credit: number
  balance: number | null
  movementAmount: number
  line: string
}

function parseMovementLine(line: string, year: number): PdfRowDraft | null {
  const head = line.match(/^(\d{2})\/(\d{2})\s+(.+)$/)
  if (!head) return null

  const tail = head[3]!.trim()
  if (/^SALDO\s+(INICIAL|FINAL)/i.test(tail)) return null

  const amountRx = /\d{1,3}(?:\.\d{3})+/g
  const amountMatches = [...tail.matchAll(amountRx)]
  if (amountMatches.length === 0) return null

  const firstIdx = tail.indexOf(amountMatches[0]![0])
  let descPart = tail.slice(0, firstIdx).trim()

  let branch: string | null = null
  for (const b of BRANCHES) {
    const re = new RegExp(`\\s+${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
    if (re.test(descPart)) {
      branch = b
      descPart = descPart.replace(re, '').trim()
      break
    }
  }
  if (!branch) {
    const bm = descPart.match(/\s+(INTERNET|CENTRAL)\s*$/i)
    if (bm) {
      branch = bm[1]!.toUpperCase()
      descPart = descPart.slice(0, -bm[0].length).trim()
    }
  }

  const amounts = amountMatches.map(m => parseChileanDots(m[0]!))
  const description = descPart || 'Sin descripción'

  const movementDate =
    parseChileanTextDate(`${head[1]}/${head[2]}/${year}`) ??
    parseCartolaDate(`${head[1]}/${head[2]}/${year}`)

  if (!movementDate) return null

  let debit = 0
  let credit = 0
  let balance: number | null = null
  let movementAmount = 0

  if (amounts.length >= 3) {
    debit = amounts[amounts.length - 3]!
    credit = amounts[amounts.length - 2]!
    balance = amounts[amounts.length - 1]!
    movementAmount = debit > 0 ? debit : credit
  } else if (amounts.length === 2) {
    balance = amounts[1]!
    movementAmount = amounts[0]!
  } else {
    movementAmount = amounts[0]!
  }

  return {
    movementDate,
    description,
    branch,
    debit,
    credit,
    balance,
    movementAmount,
    line,
  }
}

export async function parseCartolaEmitidaFromPdf(buf: ArrayBuffer): Promise<ParsedCartola> {
  const warnings: string[] = []
  const lines = await extractPdfLines(buf)

  if (lines.length === 0) {
    return { meta: emptyMeta, movements: [], warnings: ['El PDF no contiene texto legible.'] }
  }

  const meta = extractMetaFromPdfLines(lines)
  const year = extractPeriodYear(lines)
  const accountNumber = meta.accountNumber ?? 'sin-cuenta'

  if (!meta.accountNumber) {
    warnings.push('No se detectó número de cuenta en el PDF.')
  }

  const rows: PdfRowDraft[] = []
  for (const line of lines) {
    if (!/^\d{2}\/\d{2}\s+/.test(line)) continue
    const row = parseMovementLine(line, year)
    if (row) rows.push(row)
  }

  // Cartola PDF: filas de más reciente a más antiguo; el saldo anterior está en la fila siguiente
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (row.debit > 0 || row.credit > 0) continue

    const prevBalance = rows[i + 1]?.balance ?? null
    const { debit, credit } = inferDebitCreditFromBalances(
      row.movementAmount,
      row.balance,
      prevBalance,
      row.description,
    )
    row.debit = debit
    row.credit = credit
  }

  const movements: CartolaMovementDraft[] = rows.map((row, i) => ({
    rowNumber: i + 1,
    movementDate: row.movementDate,
    description: row.description,
    debit: row.debit,
    credit: row.credit,
    balance: row.balance,
    documentNumber: null,
    trn: null,
    branch: row.branch,
    raw: { line: row.line, year },
    importHash: buildImportHash(
      accountNumber,
      row.movementDate,
      row.description,
      row.debit,
      row.credit,
      row.balance,
      null,
    ),
  }))

  if (movements.length === 0) {
    warnings.push('No se encontraron movimientos con formato DD/MM en el PDF.')
  }

  return { meta, movements, warnings }
}
