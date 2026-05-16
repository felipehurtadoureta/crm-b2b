import { Outlet, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { roleCanAccessPath } from '@/lib/permissions'

export default function MainLayout() {
  const location = useLocation()
  const { profile, loading } = useAuth()

  if (profile && !roleCanAccessPath(profile.role, location.pathname)) {
    return <Navigate to="/" replace />
  }

  // Misma carcasa (sidebar + main) al reingresar: evita la sensación de recarga completa de página.
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        {loading && !profile && (
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
            Cargando perfil…
          </div>
        )}
        {!loading && !profile && (
          <div className="max-w-md mx-auto mt-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">No se encontró el perfil de usuario.</p>
            <p className="mt-1 text-amber-800/95">
              Puede cerrar sesión e ingresar de nuevo. Si el problema continúa, contacte al administrador.
            </p>
          </div>
        )}
        {profile && <Outlet />}
      </main>
    </div>
  )
}