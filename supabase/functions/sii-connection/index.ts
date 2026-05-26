/**
 * Alta/edición de conexiones SII (solo metadatos; importación vía archivo en el CRM).
 *
 * supabase functions deploy sii-connection
 */
import { corsHeaders, jsonResponse, normalizeRut, requireSuperAdmin } from '../_shared/siiAuth.ts'

type Body = {
  action?: 'upsert' | 'delete'
  id?: string
  rut?: string
  legal_name?: string
  is_active?: boolean
  initial_sync_months?: number
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

  const action = body.action ?? 'upsert'

  if (action === 'delete') {
    const id = (body.id ?? '').trim()
    if (!id) return jsonResponse({ error: 'id es obligatorio para eliminar' }, 400)
    const { error } = await admin.from('sii_connections').delete().eq('id', id)
    if (error) return jsonResponse({ error: error.message }, 400)
    return jsonResponse({ ok: true, deleted: id })
  }

  const rut = normalizeRut(body.rut ?? '')
  const legal_name = (body.legal_name ?? '').trim()
  const is_active = body.is_active ?? true
  const initial_sync_months = body.initial_sync_months ?? 12
  const existingId = (body.id ?? '').trim()

  if (!rut) return jsonResponse({ error: 'RUT es obligatorio' }, 400)
  if (!legal_name) return jsonResponse({ error: 'Razón social es obligatoria' }, 400)

  let connectionId = existingId

  if (existingId) {
    const { error } = await admin
      .from('sii_connections')
      .update({
        rut,
        legal_name,
        provider: 'direct',
        is_active,
        initial_sync_months,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId)
    if (error) return jsonResponse({ error: error.message }, 400)
  } else {
    const { data, error } = await admin
      .from('sii_connections')
      .insert({
        rut,
        legal_name,
        provider: 'direct',
        is_active,
        initial_sync_months,
      })
      .select('id')
      .single()
    if (error) return jsonResponse({ error: error.message }, 400)
    connectionId = data?.id as string
  }

  const { data: row, error: fetchErr } = await admin
    .from('sii_connections')
    .select(
      'id, rut, legal_name, provider, is_active, initial_sync_months, last_sync_at, last_sync_compras_at, last_sync_ventas_at, last_sync_honorarios_at, created_at, updated_at',
    )
    .eq('id', connectionId)
    .single()

  if (fetchErr || !row) {
    return jsonResponse({ error: fetchErr?.message ?? 'No se pudo leer la conexión' }, 500)
  }

  return jsonResponse({
    ok: true,
    connection: row,
  })
})
