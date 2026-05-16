/**
 * Invita un usuario por correo (Supabase Auth admin.inviteUserByEmail).
 * Requiere desplegar la función y definir el secreto SITE_URL (URL base de la app, ej. https://mi-crm.com).
 *
 * supabase functions deploy invite-user
 * supabase secrets set SITE_URL=https://tu-dominio.com
 *
 * En local, el CRM puede enviar app_origin (p. ej. http://localhost:5173) para el redirect del mail;
 * así no dependés del puerto en el secreto. En producción seguí usando SITE_URL en secretos.
 *
 * En Auth → URL configuration, agregá cada origen que uses + /auth/reset-password en Redirect URLs.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Body = {
  email?: string
  full_name?: string
  phone?: string
  role?: string
  /** Origen del CRM (solo hosts locales/LAN permitidos); evita mail con localhost:3000 si usás Vite :5173 */
  app_origin?: string
}

const ALLOWED_ROLES = ['kam', 'reader'] as const

/** Origen permitido para redirect (dev); no aceptamos dominios arbitrarios para evitar abuso. */
function parseAllowedLocalAppOrigin(raw: string): string | null {
  const s = raw.trim().replace(/\/$/, '')
  if (!s) return null
  try {
    const u = new URL(s)
    const h = u.hostname
    const allowedHost =
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '[::1]' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)
    if (!allowedHost) return null
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrlFromSecret = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '')

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Faltan variables de entorno en el servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return new Response(JSON.stringify({ error: 'Cuerpo JSON inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const siteUrl =
    parseAllowedLocalAppOrigin(body.app_origin ?? '') || siteUrlFromSecret

  if (!siteUrl) {
    return new Response(
      JSON.stringify({
        error:
          'Definí el secreto SITE_URL (URL del CRM, sin barra final) o invitá con el CRM abierto desde localhost/LAN para usar el puerto correcto (p. ej. :5173).',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const email = (body.email ?? '').trim().toLowerCase()
  const full_name = (body.full_name ?? '').trim()
  const phone = (body.phone ?? '').trim()
  const role = (body.role ?? 'reader').trim()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Correo inválido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!full_name) {
    return new Response(JSON.stringify({ error: 'El nombre es obligatorio' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return new Response(JSON.stringify({ error: 'Rol no permitido para invitación' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser()
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: prof, error: profErr } = await supabaseUser
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profErr || prof?.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'Solo super_admin puede invitar usuarios' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const redirectTo = `${siteUrl}/auth/reset-password`

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name,
      role,
      ...(phone ? { phone } : {}),
    },
    redirectTo,
  })

  if (inviteErr) {
    const msg = inviteErr.message ?? 'No se pudo enviar la invitación'
    const status = msg.toLowerCase().includes('already been registered') || msg.includes('already registered')
      ? 409
      : 400
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      user_id: invited.user?.id ?? null,
      message: 'Se envió un correo de invitación. La persona debe seguir el enlace para definir su contraseña.',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
