/**
 * Parseo de Excel para importar empresas, contactos y productos (catálogo).
 * Cabeceras flexibles (español / inglés).
 */
import * as XLSX from 'xlsx'
import type { InventoryCustody, ProductCurrency, ProductType } from '@/types'

export type CompanyStatus = 'activo' | 'inactivo' | 'potencial'

export interface ExcelCompanyDraft {
  /** Número de fila en la hoja (1 = encabezado; primera fila de datos = 2) */
  rowNumber: number
  name: string
  rut: string | null
  industry: string | null
  website: string | null
  address: string | null
  city: string | null
  country: string
  phone: string | null
  status: CompanyStatus
  notes: string | null
  leadKamEmail: string | null
}

export interface ExcelContactDraft {
  rowNumber: number
  /** Texto para enlazar con la empresa (mismo que columna nombre en hoja empresas) */
  companyName: string
  companyRut: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  position: string | null
  department: string | null
  isPrimary: boolean
  isActive: boolean
  notes: string | null
}

export interface ParsedWorkbook {
  sheetNames: string[]
  getSheetRows: (sheetName: string) => Record<string, unknown>[]
}

function normalizeHeaderKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

/** Primera fila del JSON = encabezados; devuelve mapa cabecera normalizada → clave real en el objeto */
function headerLookup(firstRow: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>()
  for (const key of Object.keys(firstRow)) {
    m.set(normalizeHeaderKey(key), key)
  }
  return m
}

function cell(
  lookup: Map<string, string>,
  row: Record<string, unknown>,
  ...candidates: string[]
): string {
  for (const c of candidates) {
    const real = lookup.get(normalizeHeaderKey(c))
    if (!real) continue
    const v = row[real]
    if (v == null) continue
    const s = String(v).trim()
    if (s !== '') return s
  }
  return ''
}

/** Valor de celda sin forzar texto (útil cuando `rawValues` deja números como number). */
function cellRaw(
  lookup: Map<string, string>,
  row: Record<string, unknown>,
  ...candidates: string[]
): unknown {
  for (const c of candidates) {
    const real = lookup.get(normalizeHeaderKey(c))
    if (!real) continue
    const v = row[real]
    if (v == null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    return v
  }
  return ''
}

function parseStatus(raw: string): CompanyStatus {
  const s = normalizeHeaderKey(raw).replace(/_/g, '')
  if (['inactivo', 'inactive', 'no', '0', 'false'].includes(s)) return 'inactivo'
  if (['potencial', 'lead', 'prospect'].includes(s)) return 'potencial'
  return 'activo'
}

function parseBool(raw: string, defaultTrue: boolean): boolean {
  const s = normalizeHeaderKey(raw).replace(/_/g, '')
  if (['no', '0', 'false', 'n', 'inactivo', 'falso'].includes(s)) return false
  if (['si', 'sí', 'yes', '1', 'true', 'y', 's', 'activo', 'verdadero', 'x'].includes(s)) return true
  if (s === '') return defaultTrue
  return defaultTrue
}

export function readWorkbookFromArrayBuffer(buf: ArrayBuffer, opts?: { rawValues?: boolean }): ParsedWorkbook {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetNames = wb.SheetNames
  const rawOpt = opts?.rawValues ?? false
  const getSheetRows = (sheetName: string): Record<string, unknown>[] => {
    const ws = wb.Sheets[sheetName]
    if (!ws) return []
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: rawOpt })
  }
  return { sheetNames, getSheetRows }
}

export function parseCompanyRows(rows: Record<string, unknown>[]): ExcelCompanyDraft[] {
  if (!rows.length) return []
  const lookup = headerLookup(rows[0])
  const out: ExcelCompanyDraft[] = []
  rows.forEach((row, i) => {
    const name = cell(lookup, row,
      'nombre', 'nombre_empresa', 'empresa', 'company', 'razon_social', 'razón_social', 'name',
    )
    if (!name) return
    const rut = cell(lookup, row, 'rut', 'tax_id', 'taxid') || null
    const industry = cell(lookup, row, 'industria', 'industry', 'rubro') || null
    const website = cell(lookup, row, 'sitio_web', 'website', 'web', 'url') || null
    const address = cell(lookup, row, 'direccion', 'dirección', 'address', 'calle') || null
    const city = cell(lookup, row, 'ciudad', 'city', 'comuna') || null
    const country = cell(lookup, row, 'pais', 'país', 'country') || 'Chile'
    const phone = cell(lookup, row, 'telefono', 'teléfono', 'phone', 'fono', 'celular') || null
    const statusRaw = cell(lookup, row, 'estado', 'status', 'situacion', 'situación')
    const notes = cell(lookup, row, 'notas', 'notes', 'observaciones') || null
    const leadKamEmail = cell(lookup, row,
      'email_kam', 'kam_email', 'kam_lead_email', 'email_kam_lead', 'lead_kam_email',
    ) || null
    out.push({
      rowNumber: i + 2,
      name,
      rut,
      industry,
      website,
      address,
      city,
      country,
      phone,
      status: parseStatus(statusRaw),
      notes,
      leadKamEmail,
    })
  })
  return out
}

export function parseContactRows(rows: Record<string, unknown>[]): ExcelContactDraft[] {
  if (!rows.length) return []
  const lookup = headerLookup(rows[0])
  const out: ExcelContactDraft[] = []
  rows.forEach((row, i) => {
    const companyName = cell(lookup, row,
      'empresa', 'nombre_empresa', 'company', 'razon_social', 'razón_social', 'cliente',
    )
    const companyRut = cell(lookup, row, 'rut_empresa', 'empresa_rut', 'company_rut') || null
    const firstName = cell(lookup, row, 'nombre', 'nombres', 'first_name', 'firstname', 'contacto_nombre')
    const lastName = cell(lookup, row, 'apellido', 'apellidos', 'last_name', 'lastname', 'contacto_apellido')
    if (!companyName || !firstName || !lastName) return
    const email = cell(lookup, row, 'email', 'correo', 'e_mail', 'mail') || null
    const phone = cell(lookup, row, 'telefono', 'teléfono', 'phone', 'fono', 'celular') || null
    const position = cell(lookup, row, 'cargo', 'position', 'puesto', 'titulo', 'título') || null
    const department = cell(lookup, row, 'departamento', 'department', 'area', 'área') || null
    const primaryRaw = cell(lookup, row, 'principal', 'es_principal', 'primary', 'contacto_principal')
    const activeRaw = cell(lookup, row, 'activo', 'is_active', 'active', 'estado')
    const notes = cell(lookup, row, 'notas', 'notes', 'observaciones') || null
    out.push({
      rowNumber: i + 2,
      companyName,
      companyRut,
      firstName,
      lastName,
      email,
      phone,
      position,
      department,
      isPrimary: parseBool(primaryRaw, false),
      isActive: parseBool(activeRaw, true),
      notes,
    })
  })
  return out
}

export interface ExcelProductDraft {
  rowNumber: number
  name: string
  sku: string | null
  description: string | null
  type: ProductType
  has_inventory: boolean
  service_category: string | null
  price: number
  currency: ProductCurrency
  tax_rate: number
  is_active: boolean
}

function parseProductTypeFromCell(raw: string): ProductType {
  const s = normalizeHeaderKey(raw).replace(/_/g, '')
  if (!s) return 'product'
  if (['servicio', 'service', 'services'].includes(s)) return 'service'
  if (['inventario', 'inventory'].includes(s)) return 'inventory'
  if (['producto', 'product', 'products', 'mercaderia', 'mercadería', 'bien', 'físico', 'fisico'].includes(s)) {
    return 'product'
  }
  return 'product'
}

function parseCurrencyCell(raw: string): ProductCurrency {
  const s = normalizeHeaderKey(raw).replace(/_/g, '').toUpperCase()
  if (!s) return 'CLP'
  if (s.includes('USD') || s.includes('DOLAR') || s.includes('DOLLAR')) return 'USD'
  if (s.includes('UF')) return 'UF'
  return 'CLP'
}

function parseMoneyUnknown(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const t = String(v ?? '').trim().replace(/\s/g, '').replace(/\$/g, '').replace(/\u00a0/g, '')
  if (!t) return 0
  let s = t.replace(/[^\d,.\-+]/gi, '').replace(/^\+/, '')
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      s = parts[0].replace(/\./g, '') + '.' + parts[1]
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasDot) {
    const parts = s.split('.')
    if (parts.length > 1 && parts[parts.length - 1]?.length === 3 && parts.length >= 2) {
      const onlyThousands = parts.every((p, i) => i < parts.length - 1 ? p !== '' && p.length <= 3 : p.length === 3)
      if (onlyThousands) s = parts.join('')
    }
  }
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * Columnas reconocidas: nombre/producto/name, sku/código/codigo, descripción/description,
 * tipo/type (producto|servicio|inventario), stock/has_inventory, categoría de servicio (service_category/rubro),
 * precio/price, moneda/currency, iva/tax_rate, activo/is_active.
 */
export function parseProductRows(rows: Record<string, unknown>[]): ExcelProductDraft[] {
  if (!rows.length) return []
  const lookup = headerLookup(rows[0])
  const out: ExcelProductDraft[] = []
  rows.forEach((row, i) => {
    const name = cell(lookup, row, 'nombre', 'producto', 'name', 'item').trim()
    if (!name) return

    const skuRaw = cell(lookup, row, 'sku', 'codigo', 'código', 'code', 'referencia').trim()
    const sku = skuRaw !== '' ? skuRaw : null

    const description =
      cell(lookup, row, 'descripcion', 'descripción', 'description', 'detalle').trim() || null

    const tipoStr = cell(lookup, row, 'tipo', 'type')
    const productType = parseProductTypeFromCell(tipoStr)
    let has_inventory = parseBool(cell(lookup, row, 'stock', 'has_inventory', 'con_stock', 'tiene_stock'), false)
    const boolStockRaw = cellRaw(
      lookup,
      row,
      'stock',
      'has_inventory',
      'con_stock',
      'tiene_stock',
      'inventario_propio',
    )
    if (typeof boolStockRaw === 'boolean') has_inventory = boolStockRaw

    const rubroServicio =
      cell(lookup, row, 'categoria_servicio', 'categoria', 'categoría', 'service_category', 'rubro').trim() || ''

    const price = parseMoneyUnknown(cellRaw(lookup, row, 'precio', 'price', 'precio_unitario', 'valor'))

    const currencyRaw = cell(lookup, row, 'moneda', 'currency')
    const currency = parseCurrencyCell(currencyRaw || 'CLP')

    const taxRaw = cellRaw(lookup, row, 'iva', 'tax_rate', 'impuesto', 'tasa_impuesto')
    const taxMissing =
      taxRaw === '' || taxRaw === null ||
      (typeof taxRaw === 'string' && taxRaw.trim() === '')

    const taxParsedNum = taxMissing ? NaN : parseMoneyUnknown(taxRaw)

    /** Celda ausente ⇒ 19. «0», «exento», etc. ⇒ 0. Número o texto válido ⇒ valor. */
    let tax_rate = 19
    if (!taxMissing) {
      const tex =
        typeof taxRaw === 'string' ? taxRaw.trim() : String(taxRaw)
      if (/exento|exenta|sin\s*iva/i.test(tex) || /^0([\s.%]*|%)?$/i.test(tex.replace(/\u00a0/g, '').trim()))
        tax_rate = 0
      else tax_rate = Number.isFinite(taxParsedNum) ? taxParsedNum : 19
    }
    if (!Number.isFinite(tax_rate) || tax_rate < 0) tax_rate = 19

    const activeRaw = cell(lookup, row, 'activo', 'is_active', 'estado', 'habilitado')

    const is_active = parseBool(activeRaw, true)

    const hasInvFinal = productType === 'service' ? false : has_inventory

    /** `service_category` en BD solo tiene sentido en servicios según UI del catálogo. */
    const service_category = productType === 'service' && rubroServicio !== '' ? rubroServicio : null

    out.push({
      rowNumber: i + 2,
      name,
      sku,
      description,
      type: productType,
      has_inventory: hasInvFinal,
      service_category,
      price,
      currency,
      tax_rate,
      is_active,
    })
  })
  return out
}

/**
 * Filas de inventario físico (una fila = un número de serie).
 * Cabeceras flexibles en español o inglés.
 */
export interface ExcelInventorySerialDraft {
  rowNumber: number
  productName: string
  serialNumber: string
  custody: InventoryCustody
  notes: string | null
  referencePrice: number | null
  referenceCurrency: ProductCurrency
  /** disponible | reservado | vendido | dañado */
  status: string
}

/** Interpreta ubicación textual → custodia + estado operativo si no viene columna estado. */
function parseUbicacionYEstado(
  ubicacionRaw: string,
  estadoRaw: string,
): { custody: InventoryCustody; status: string } {
  const ut = String(ubicacionRaw ?? '').trim().toLowerCase()
  const e = String(estadoRaw ?? '').trim().toLowerCase()

  let custody: InventoryCustody = 'bodega'
  if (ut.includes('vendid') || ut.includes('cliente') || ut.includes('instal')) custody = 'en_cliente'
  else if (ut.includes('prestam') || ut.includes('comodato')) custody = 'prestamo'
  else if (ut.includes('transit') || ut.includes('tránsito') || ut.includes('envío') || ut.includes('envio'))
    custody = 'transito'
  else if (ut.includes('bodega') || ut.includes('almacén') || ut.includes('almacen') || ut.includes('deposito'))
    custody = 'bodega'

  let status = 'disponible'
  if (e) {
    if (e.includes('reserv')) status = 'reservado'
    else if (e.includes('vendid')) status = 'vendido'
    else if (e.includes('dan')) status = 'dañado'
    else if (e.includes('dispon') || e === 'ok' || e === 'activo') status = 'disponible'
  } else {
    if (ut.includes('vendid')) status = 'vendido'
    else if (ut.includes('reserv')) status = 'reservado'
    else if (ut.includes('dan')) status = 'dañado'
  }

  return { custody, status }
}

/**
 * Hoja con una fila por unidad física.
 * Columnas típicas: nombre del producto / producto + número de serie / serie + ubicación / nota / precio / moneda / estado (opcional).
 */
export function parseInventorySerialRows(rows: Record<string, unknown>[]): ExcelInventorySerialDraft[] {
  if (!rows.length) return []
  const lookup = headerLookup(rows[0])
  const out: ExcelInventorySerialDraft[] = []
  rows.forEach((row, i) => {
    const productName = cell(
      lookup,
      row,
      'nombre_producto',
      'nombre_del_producto',
      'producto',
      'nombre',
      'modelo',
      'articulo',
      'artículo',
      'item',
      'name',
    ).trim()

    const serialNumber = cell(
      lookup,
      row,
      'numero_de_serie',
      'número_de_serie',
      'serie',
      'serial',
      'ns',
      'n_serie',
      'sn',
    ).trim()

    if (!productName || !serialNumber) return

    const ubicacion = cell(
      lookup,
      row,
      'ubicacion',
      'ubicación',
      'custodia',
      'location',
      'donde',
      'lugar',
    )
    const estado = cell(lookup, row, 'estado', 'status', 'estado_item')
    const { custody, status } = parseUbicacionYEstado(ubicacion, estado)

    const notes =
      cell(lookup, row, 'nota', 'notas', 'observacion', 'observaciones', 'comentario', 'descripcion', 'descripción').trim() ||
      null

    const priceRaw = cellRaw(lookup, row, 'precio', 'price', 'valor', 'valor_referencia', 'p_unitario')
    const refNum = parseMoneyUnknown(priceRaw)
    const referencePrice = refNum > 0 ? refNum : null

    const currencyRaw = cell(lookup, row, 'moneda', 'currency')
    const referenceCurrency = parseCurrencyCell(currencyRaw || 'CLP')

    out.push({
      rowNumber: i + 2,
      productName,
      serialNumber,
      custody,
      notes,
      referencePrice,
      referenceCurrency,
      status,
    })
  })
  return out
}

export function normCompanyKey(name: string, rut: string | null): string {
  const n = name.trim().toLowerCase()
  const r = (rut ?? '').replace(/\./g, '').replace(/-/g, '').trim().toLowerCase()
  if (r) return `r:${r}`
  return `n:${n}`
}
