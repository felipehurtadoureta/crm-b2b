import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { REMEMBER_EMAIL_KEY } from '@/lib/authStorage'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotModalError, setForgotModalError] = useState<string | null>(null)
  /** Mensaje tras enviar recuperación (visible en la tarjeta principal). */
  const [resetInfo, setResetInfo] = useState<string | null>(null)

  // Hidratar correo guardado (recordar correo)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (saved) {
        setEmail(saved)
        setRememberEmail(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password })

    if (signErr) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    try {
      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim())
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
    } catch {
      /* ignore */
    }

    setLoading(false)
  }

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotModalError(null)
    const to = forgotEmail.trim() || email.trim()
    if (!to) {
      setForgotModalError('Ingresá un correo.')
      return
    }
    setForgotLoading(true)
    const redirectTo = `${window.location.origin}/auth/reset-password`
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(to, { redirectTo })
    setForgotLoading(false)
    if (resetErr) {
      setForgotModalError(resetErr.message ?? 'No se pudo enviar el correo.')
      return
    }
    setResetInfo('Si el correo existe en el sistema, recibirás un enlace para restablecer la clave.')
    setForgotOpen(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">CRM B2B</CardTitle>
          <CardDescription>Ingresa tus credenciales para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer text-gray-600">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={rememberEmail}
                  onChange={e => setRememberEmail(e.target.checked)}
                />
                Recordar correo
              </label>
              <button
                type="button"
                className="text-blue-600 hover:underline text-left sm:text-right"
                onClick={() => {
                  setForgotEmail(email)
                  setForgotOpen(true)
                  setResetInfo(null)
                }}
              >
                Olvidé mi contraseña
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Por seguridad no guardamos la contraseña en el navegador; solo el correo si activás “Recordar correo”.
            </p>

            {resetInfo && (
              <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">{resetInfo}</p>
            )}

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

          {forgotOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
              <Card className="w-full max-w-sm shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Recuperar contraseña</CardTitle>
                  <CardDescription>
                    Te enviaremos un enlace de Supabase al correo indicado (revisá también spam).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={sendReset} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Correo</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder="tu@email.com"
                        required
                      />
                    </div>
                    {forgotModalError && <p className="text-xs text-red-600">{forgotModalError}</p>}
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={forgotLoading}>
                        {forgotLoading ? 'Enviando…' : 'Enviar enlace'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
