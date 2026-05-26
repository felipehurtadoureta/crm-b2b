/**
 * Importa documentos SII desde archivo CSV/Excel (sin BaseAPI).
 *
 * supabase functions deploy sii-import
 */
import {
  normalizeHonorariumRows,
  normalizePurchaseRows,
  normalizeSaleRows,
  type SiiFileContext,
} from '../_shared/siiFileNormalize.ts'
import { corsHeaders, jsonResponse, requireSuperAdmin, type SiiConnectionRow } from '../_shared/siiAuth.ts'
import { resolveCompanyId, upsertIgnore, type SyncCount } from '../_shared/siiDb.ts'

type ImportType = 'compras' | 'ventas' | 'honorarios'

type Body = {
  connection_id?: string
  import_type?: ImportType
  periodo?: string
  /** Filas con nombres de columna tal como vienen del SII (CSV/Excel). */
  rows?: Record<string, unknown>[]
  /** Solo honorarios: BHE recibidas o BTE emitidas. */
  tipo_boleta?: 'BHE' | 'BTE'
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'Faltan variables de entorno en el servidor' }, 500)
  }

  const auth = await requireSuperAdmin(req, supabaseUrl, anonKey)
  if (auth instanceof Response) return auth
  const { admin } = auth

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido' }, 400)
  }

  const connectionId = (body.connection_id ?? '').trim()
  const importType = body.import_type
  const periodo = (body.periodo ?? '').trim()
  const rows = body.rows ?? []

  if (!connectionId) return jsonResponse({ error: 'connection_id es obligatorio' }, 400)
  if (!importType || !['compras', 'ventas', 'honorarios'].includes(importType)) {
    return jsonResponse({ error: 'import_type debe ser compras, ventas u honorarios' }, 400)
  }
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return jsonResponse({ error: 'periodo debe ser YYYY-MM (ej. 2025-03)' }, 400)
  }
  if (rows.length === 0) return jsonResponse({ error: 'El archivo no tiene filas de datos' }, 400)
  if (rows.length > 5000) {
    return jsonResponse({ error: 'Máximo 5000 filas por importación' }, 400)
  }

  const { data: conn, error: connErr } = await admin
    .from('sii_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('is_active', true)
    .single()

  if (connErr || !conn) {
    return jsonResponse({ error: 'Conexión SII no encontrada o inactiva' }, 404)
  }

  const connection = conn as SiiConnectionRow
  const ctx: SiiFileContext = {
    connectionId,
    rut: connection.rut,
    password: '',
  }

  const nowIso = new Date().toISOString()
  let count: SyncCount = { inserted: 0, skipped: 0, fetched: 0 }

  try {
    if (importType === 'compras') {
      const docs = await normalizePurchaseRows(ctx, periodo, rows)
      const dbRows = await Promise.all(
        docs.map(async d => ({
          connection_id: connectionId,
          periodo: d.periodo,
          tipo_dte: d.tipo_dte,
          folio: d.folio,
          fecha_emision: d.fecha_emision,
          rut_emisor: d.rut_emisor,
          razon_social_emisor: d.razon_social_emisor,
          monto_neto: d.monto_neto,
          monto_iva: d.monto_iva,
          monto_total: d.monto_total,
          estado_rcv: d.estado_rcv,
          company_id: await resolveCompanyId(admin, d.rut_emisor),
          sii_import_hash: d.sii_import_hash,
          raw: d.raw,
          synced_at: nowIso,
        })),
      )
      count = await upsertIgnore(admin, 'sii_purchase_documents', dbRows)
    } else if (importType === 'ventas') {
      const docs = await normalizeSaleRows(ctx, periodo, rows)
      const dbRows = await Promise.all(
        docs.map(async d => ({
          connection_id: connectionId,
          periodo: d.periodo,
          tipo_dte: d.tipo_dte,
          folio: d.folio,
          fecha_emision: d.fecha_emision,
          rut_receptor: d.rut_receptor,
          razon_social_receptor: d.razon_social_receptor,
          monto_neto: d.monto_neto,
          monto_iva: d.monto_iva,
          monto_total: d.monto_total,
          estado_rcv: d.estado_rcv,
          company_id: await resolveCompanyId(admin, d.rut_receptor),
          sii_import_hash: d.sii_import_hash,
          raw: d.raw,
          synced_at: nowIso,
        })),
      )
      count = await upsertIgnore(admin, 'sii_sales_documents', dbRows)
    } else {
      const tipo = body.tipo_boleta === 'BTE' ? 'BTE' : 'BHE'
      const docs = await normalizeHonorariumRows(ctx, periodo, rows, tipo)
      const dbRows = await Promise.all(
        docs.map(async d => ({
          connection_id: connectionId,
          periodo: d.periodo,
          numero_boleta: d.numero_boleta,
          fecha: d.fecha,
          rut_prestador: d.rut_prestador,
          rut_receptor: d.rut_receptor,
          nombre_prestador: d.nombre_prestador,
          monto_bruto: d.monto_bruto,
          retencion: d.retencion,
          liquido: d.liquido,
          estado: d.estado,
          tipo_boleta: d.tipo_boleta,
          company_id: await resolveCompanyId(admin, d.rut_prestador),
          sii_import_hash: d.sii_import_hash,
          raw: d.raw,
          synced_at: nowIso,
        })),
      )
      count = await upsertIgnore(admin, 'sii_honorarium_receipts', dbRows)
    }
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 400)
  }

  const patch: Record<string, string> = { last_sync_at: nowIso }
  if (importType === 'compras') patch.last_sync_compras_at = nowIso
  if (importType === 'ventas') patch.last_sync_ventas_at = nowIso
  if (importType === 'honorarios') patch.last_sync_honorarios_at = nowIso
  await admin.from('sii_connections').update(patch).eq('id', connectionId)

  return jsonResponse({
    ok: true,
    import_type: importType,
    periodo,
    inserted: count.inserted,
    skipped: count.skipped,
    fetched: count.fetched,
  })
})
