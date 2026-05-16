import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase')
}

/** true si la app corre en un host típico de desarrollo (Vite dev / preview en esta máquina o LAN). */
function isLocalAppHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
    h.endsWith('.local')
  )
}

/**
 * En local, algunas respuestas de /functions/v1 llegan sin CORS usable → "Failed to fetch".
 * Reescribimos al proxy de vite.config.ts (también con `vite preview`, donde import.meta.env.DEV es false).
 * Desactivar: VITE_SUPABASE_FUNCTIONS_DEV_PROXY=false
 */
function wrapFetchForLocalFunctionsProxy(inner: typeof fetch): typeof fetch {
  let supabaseOrigin: string
  try {
    supabaseOrigin = new URL(supabaseUrl).origin
  } catch {
    return inner
  }

  return (input, init) => {
    const useProxy =
      import.meta.env.VITE_SUPABASE_FUNCTIONS_DEV_PROXY !== 'false' && isLocalAppHost()
    if (!useProxy) return inner(input as RequestInfo, init)

    try {
      const reqUrl =
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : (input as URL).href

      const u = new URL(reqUrl)
      if (u.origin === supabaseOrigin && u.pathname.startsWith('/functions/v1')) {
        const pathAndQuery = `${u.pathname}${u.search}`
        const proxied = `/__proxy/supabase${pathAndQuery}`
        if (input instanceof Request) {
          return inner(new Request(proxied, input))
        }
        return inner(proxied, init)
      }
    } catch {
      /* seguir con fetch normal */
    }

    return inner(input as RequestInfo, init)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: wrapFetchForLocalFunctionsProxy(fetch),
  },
})

/** Enlace al panel Auth Users (solo URL estándar *.supabase.co). */
export function getSupabaseDashboardAuthUsersUrl(): string | null {
  try {
    const u = new URL(supabaseUrl)
    const m = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)
    if (!m) return null
    return `https://supabase.com/dashboard/project/${m[1]}/auth/users`
  } catch {
    return null
  }
}