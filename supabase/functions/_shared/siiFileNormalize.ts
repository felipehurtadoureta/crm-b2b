import { sha256Hex } from './siiCrypto.ts'

export type NormalizedPurchase = {
  periodo: string
  tipo_dte: string
  folio: string
  fecha_emision: string
  rut_emisor: string
  razon_social_emisor: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  estado_rcv: string | null
  sii_import_hash: string
  raw: Record<string, unknown>
}

export type NormalizedSale = {
  periodo: string
  tipo_dte: string
  folio: string
  fecha_emision: string
  rut_receptor: string
  razon_social_receptor: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  estado_rcv: string | null
  sii_import_hash: string
  raw: Record<string, unknown>
}

export type NormalizedHonorarium = {
  periodo: string
  numero_boleta: string
  fecha: string
  rut_prestador: string
  rut_receptor: string
  nombre_prestador: string
  monto_bruto: number
  retencion: number
  liquido: number
  estado: string | null
  tipo_boleta: 'BHE' | 'BTE'
  sii_import_hash: string
  raw: Record<string, unknown>
}

/** Contexto mínimo para importación desde archivo (RCV / honorarios del portal SII). */
export type SiiFileContext = {
  connectionId: string
  rut: string
}

function num(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function pickField(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

function parseChileanDate(d: string): string {
  const s = d.trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s.slice(0, 10) || new Date().toISOString().slice(0, 10)
}

function pickDate(raw: Record<string, unknown>): string {
  const d = pickField(
    raw,
    'Fecha Docto',
    'Fecha Documento',
    'fecha_emision',
    'fechaEmision',
    'fecha',
    'FechaEmision',
    'FchEmis',
    'fechaDocto',
  )
  return parseChileanDate(d)
}

function pickTipo(raw: Record<string, unknown>): string {
  return pickField(raw, 'Tipo Doc', 'Tipo DTE', 'tipo_dte', 'tipo_doc', 'tipoDoc', 'tipo', 'TipoDTE', 'tipoDoc')
}

function pickFolio(raw: Record<string, unknown>): string {
  return pickField(raw, 'Folio', 'folio', 'numero', 'nro', 'numeroBoleta', 'numero_boleta')
}

async function hashDte(connectionId: string, parts: string[]): Promise<string> {
  return sha256Hex([connectionId, ...parts].join('|'))
}

export async function normalizePurchaseRows(
  ctx: SiiFileContext,
  periodo: string,
  docs: Record<string, unknown>[],
): Promise<NormalizedPurchase[]> {
  const out: NormalizedPurchase[] = []
  for (const raw of docs) {
    const tipo_dte = pickTipo(raw)
    const folio = pickFolio(raw)
    const fecha_emision = pickDate(raw)
    const rut_emisor = pickField(
      raw,
      'RUT Proveedor',
      'RUT Emisor',
      'rut_emisor',
      'rutEmisor',
      'rut_proveedor',
      'rutProveedor',
      'RUTEmisor',
    )
    const razon_social_emisor = pickField(
      raw,
      'Razon Social',
      'Razón Social',
      'razon_social',
      'razonSocial',
      'RznSoc',
      'nombre_emisor',
    )
    const monto_neto = num(raw['Monto Neto'] ?? raw.monto_neto ?? raw.montoNeto ?? raw.MntNeto)
    const monto_iva = num(raw['Monto IVA'] ?? raw['Monto IVA Recuperable'] ?? raw.monto_iva ?? raw.iva ?? raw.MntIVA)
    const monto_total =
      num(raw['Monto total'] ?? raw['Monto Total'] ?? raw.monto_total ?? raw.total ?? raw.MntTotal) ||
      monto_neto + monto_iva
    const estado_rcv = pickField(raw, 'estado', 'estado_rcv') || null

    const sii_import_hash = await hashDte(ctx.connectionId, [
      'compra',
      periodo,
      tipo_dte,
      folio,
      rut_emisor,
      fecha_emision,
    ])

    out.push({
      periodo,
      tipo_dte,
      folio,
      fecha_emision,
      rut_emisor,
      razon_social_emisor,
      monto_neto,
      monto_iva,
      monto_total,
      estado_rcv,
      sii_import_hash,
      raw,
    })
  }
  return out
}

export async function normalizeSaleRows(
  ctx: SiiFileContext,
  periodo: string,
  docs: Record<string, unknown>[],
): Promise<NormalizedSale[]> {
  const out: NormalizedSale[] = []
  for (const raw of docs) {
    const tipo_dte = pickTipo(raw)
    const folio = pickFolio(raw)
    const fecha_emision = pickDate(raw)
    const rut_receptor = pickField(
      raw,
      'RUT Receptor',
      'RUT Cliente',
      'rut_receptor',
      'rutReceptor',
      'rut_cliente',
      'rutCliente',
      'RUTRecep',
    )
    const razon_social_receptor = pickField(
      raw,
      'Razon Social',
      'Razón Social',
      'razon_social',
      'razonSocial',
      'RznSocRecep',
      'nombre_receptor',
    )
    const monto_neto = num(raw['Monto Neto'] ?? raw.monto_neto ?? raw.montoNeto ?? raw.MntNeto)
    const monto_iva = num(raw['Monto IVA'] ?? raw.monto_iva ?? raw.iva ?? raw.MntIVA)
    const monto_total =
      num(raw['Monto total'] ?? raw['Monto Total'] ?? raw.monto_total ?? raw.total ?? raw.MntTotal) ||
      monto_neto + monto_iva
    const estado_rcv = pickField(raw, 'estado', 'estado_rcv') || null

    const sii_import_hash = await hashDte(ctx.connectionId, [
      'venta',
      periodo,
      tipo_dte,
      folio,
      rut_receptor,
      fecha_emision,
    ])

    out.push({
      periodo,
      tipo_dte,
      folio,
      fecha_emision,
      rut_receptor,
      razon_social_receptor,
      monto_neto,
      monto_iva,
      monto_total,
      estado_rcv,
      sii_import_hash,
      raw,
    })
  }
  return out
}

function mapHonorariumRaw(
  ctx: SiiFileContext,
  periodo: string,
  raw: Record<string, unknown>,
  tipo_boleta: 'BHE' | 'BTE',
): Promise<NormalizedHonorarium> {
  const numero_boleta = pickField(raw, 'Folio', 'folio', 'numero_boleta', 'numeroBoleta', 'nro_boleta', 'NroBoleta')
  const fecha = pickDate(raw)
  const rut_prestador = pickField(
    raw,
    'RUT Emisor',
    'RUT Prestador',
    'rut_prestador',
    'rutPrestador',
    'rut_emisor',
    'rutEmisor',
    'RutEmisor',
  )
  const rut_receptor = pickField(raw, 'RUT Receptor', 'rut_receptor', 'rutReceptor', 'RutReceptor')
  const nombre_prestador = pickField(
    raw,
    'Nombre Emisor',
    'Razon Social',
    'nombre_prestador',
    'nombrePrestador',
    'razon_social',
    'nombre_emisor',
  )
  const monto_bruto = num(raw['Monto Bruto'] ?? raw.monto_bruto ?? raw.montoBruto ?? raw.bruto ?? raw.valor)
  const retencion = num(raw['Monto Retencion'] ?? raw['Retencion'] ?? raw.retencion ?? raw.monto_retencion ?? raw.retencionImpuesto)
  const liquido =
    num(raw['Monto Liquido'] ?? raw['Monto Líquido'] ?? raw.liquido ?? raw.monto_liquido ?? raw.montoLiquido) ||
    monto_bruto - retencion
  const estado = pickField(raw, 'estado', 'Estado') || null

  return hashDte(ctx.connectionId, ['honorario', tipo_boleta, periodo, numero_boleta, rut_prestador, fecha]).then(
    sii_import_hash => ({
      periodo,
      numero_boleta,
      fecha,
      rut_prestador,
      rut_receptor,
      nombre_prestador,
      monto_bruto,
      retencion,
      liquido,
      estado,
      tipo_boleta,
      sii_import_hash,
      raw,
    }),
  )
}

export async function normalizeHonorariumRows(
  ctx: SiiFileContext,
  periodo: string,
  docs: Record<string, unknown>[],
  tipo_boleta: 'BHE' | 'BTE' = 'BHE',
): Promise<NormalizedHonorarium[]> {
  const out: NormalizedHonorarium[] = []
  for (const raw of docs) {
    out.push(await mapHonorariumRaw(ctx, periodo, raw, tipo_boleta))
  }
  return out
}
