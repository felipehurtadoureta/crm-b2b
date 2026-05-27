/**
 * Detecta si un archivo RCV del SII corresponde a compras o ventas.
 *
 * Compras: RUT Proveedor, Tipo Compra (ej. RCV_COMPRA_REGISTRO_*.csv)
 * Ventas: Rut cliente, Tipo Venta (ej. RCV_VENTA_*.csv)
 */
export type RcvFileKind = 'compras' | 'ventas' | 'unknown'

function normKey(k: string): string {
  return k
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function collectRowKeys(rows: Record<string, unknown>[], maxRows = 10): string[] {
  const keys = new Set<string>()
  for (const row of rows.slice(0, maxRows)) {
    for (const k of Object.keys(row ?? {})) keys.add(k)
  }
  return [...keys]
}

/** Detecta por nombres de columna del CSV/Excel. */
export function detectRcvKindFromRowKeys(keys: string[]): RcvFileKind {
  const nk = keys.map(normKey)
  const has = (fragment: string) => nk.some(k => k === fragment || k.includes(fragment))

  const isCompra =
    has('rut proveedor') ||
    has('tipo compra') ||
    nk.some(k => k.includes('proveedor') && k.includes('rut'))

  const isVenta =
    has('rut cliente') ||
    has('rut receptor') ||
    has('tipo venta') ||
    nk.some(k => k.includes('cliente') && k.includes('rut'))

  if (isCompra && !isVenta) return 'compras'
  if (isVenta && !isCompra) return 'ventas'

  // Columnas ambiguas: priorizar Tipo Compra / Tipo Venta
  if (has('tipo compra') && !has('tipo venta')) return 'compras'
  if (has('tipo venta') && !has('tipo compra')) return 'ventas'

  return 'unknown'
}

export function detectRcvKindFromRows(rows: Record<string, unknown>[]): RcvFileKind {
  if (rows.length === 0) return 'unknown'
  return detectRcvKindFromRowKeys(collectRowKeys(rows))
}

/** Detecta por nombre de archivo exportado del SII. */
export function detectRcvKindFromFilename(filename: string): RcvFileKind {
  const n = normKey(filename.replace(/\.[^.]+$/, ''))
  if (/rcv[\s_-]*compra|compra[\s_-]*registro|registro[\s_-]*compra/.test(n)) return 'compras'
  if (/rcv[\s_-]*venta|venta[\s_-]*registro|registro[\s_-]*venta/.test(n)) return 'ventas'
  return 'unknown'
}

/** Combina columnas del archivo + nombre (columnas tienen prioridad). */
export function detectRcvKindFromSource(
  rows: Record<string, unknown>[],
  filename?: string,
  headerKeys?: string[],
): RcvFileKind {
  const fromHeaders = headerKeys?.length ? detectRcvKindFromRowKeys(headerKeys) : 'unknown'
  const fromRows = detectRcvKindFromRows(rows)
  if (fromHeaders !== 'unknown') return fromHeaders
  if (fromRows !== 'unknown') return fromRows
  if (filename) return detectRcvKindFromFilename(filename)
  return 'unknown'
}

export function rcvKindLabel(kind: RcvFileKind): string {
  if (kind === 'compras') return 'Compras (recibidas)'
  if (kind === 'ventas') return 'Ventas (emitidas)'
  return 'No detectado'
}

/**
 * Resuelve compras vs ventas por archivo (independiente de la pestaña abierta).
 */
export function resolveRcvImportType(
  requested: 'compras' | 'ventas' | 'honorarios',
  rows: Record<string, unknown>[],
  filename?: string,
  headerKeys?: string[],
): { effective: 'compras' | 'ventas' | 'honorarios'; detected: RcvFileKind; warning?: string } {
  if (requested === 'honorarios') {
    return { effective: requested, detected: 'unknown' }
  }

  const detected = detectRcvKindFromSource(rows, filename, headerKeys)

  if (detected === 'compras') {
    const warning =
      requested === 'ventas'
        ? `Archivo de Compras detectado (${filename ?? 'columnas RUT Proveedor'}). Importado como Compras.`
        : undefined
    return { effective: 'compras', detected, warning }
  }

  if (detected === 'ventas') {
    const warning =
      requested === 'compras'
        ? `Archivo de Ventas detectado (${filename ?? 'columnas Rut cliente'}). Importado como Ventas.`
        : undefined
    return { effective: 'ventas', detected, warning }
  }

  return {
    effective: requested,
    detected,
    warning:
      'No se pudo detectar Compras/Ventas. Se usó la pestaña actual; verifique el archivo del SII.',
  }
}
