import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy de Edge Functions: el navegador pega al mismo origen (localhost / LAN) y Vite reenvía a Supabase.
// Así se evita "Failed to fetch" por CORS en /functions/v1. Aplica a `vite` y `vite preview` (command === 'serve').
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')

  const functionsProxy =
    command === 'serve' &&
    supabaseUrl &&
    /^https?:\/\//i.test(supabaseUrl)
      ? {
          '/__proxy/supabase/functions/v1': {
            target: supabaseUrl,
            changeOrigin: true,
            secure: true,
            rewrite: (p: string) => p.replace(/^\/__proxy\/supabase/, ''),
          },
        }
      : undefined

  const proxyBlock = functionsProxy ? { proxy: functionsProxy } : {}

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: proxyBlock,
    preview: proxyBlock,
  }
})