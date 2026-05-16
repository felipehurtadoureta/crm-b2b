import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError(err.message ?? 'No se pudo actualizar la contraseña.')
      return
    }
    setDone(true)
    setTimeout(() => navigate('/login', { replace: true }), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Nueva contraseña</CardTitle>
          <CardDescription>
            Definí tu nueva clave. Este enlace viene del correo de recuperación de Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-sm text-emerald-600 text-center">Contraseña actualizada. Redirigiendo al login…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np">Nueva contraseña</Label>
                <Input
                  id="np"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np2">Repetir contraseña</Label>
                <Input
                  id="np2"
                  type="password"
                  autoComplete="new-password"
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
              <p className="text-[11px] text-gray-500 text-center">
                Tip: en Supabase Auth configurá la URL de redirección a{' '}
                <span className="font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}/auth/reset-password</span>
              </p>
            </form>
          )}
          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-blue-600 hover:underline">Volver al login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
