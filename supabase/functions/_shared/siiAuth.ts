import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export type SiiConnectionRow = {
  id: string
  rut: string
  legal_name: string
  provider: string
  is_active: boolean
  initial_sync_months: number
  last_sync_at: string | null
  last_sync_compras_at: string | null
  last_sync_ventas_at: string | null
  last_sync_honorarios_at: string | null
}

/** Valida JWT y exige super_admin. */
export async function requireSuperAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ userId: string; admin: SupabaseClient } | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'No autorizado' }, 401)
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) {
    return jsonResponse({ error: 'Faltan variables de entorno en el servidor' }, 500)
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser()
  if (userErr || !user) {
    return jsonResponse({ error: 'Sesión inválida' }, 401)
  }

  const { data: prof, error: profErr } = await supabaseUser
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profErr || prof?.role !== 'super_admin') {
    return jsonResponse({ error: 'Solo super_admin puede ejecutar esta acción' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { userId: user.id, admin }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function normalizeRut(rut: string): string {
  return rut.replace(/\./g, '').replace(/\s/g, '').toUpperCase()
}
