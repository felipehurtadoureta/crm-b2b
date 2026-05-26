import { useEffect, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useCrmAppSettings } from '@/hooks/useCrmAppSettings'
import { mergeCrmAppSettings } from '@/lib/crmAppSettings'
import { roleCanAccessPath } from '@/lib/permissions'

export default function MainLayout() {
  const location = useLocation()
  const { profile, loading } = useAuth()
  const branding = useCrmAppSettings()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const appName = (branding.data ?? mergeCrmAppSettings(null)).displayName

  if (profile && !roleCanAccessPath(profile.role, location.pathname)) {
    return <Navigate to="/" replace />
  }

  // Cierra el menú al cambiar de ruta (p. ej. tras elegir una pantalla en móvil).
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  // Evita scroll del contenido detrás del drawer en móvil.
  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  const closeMobileNav = () => setMobileNavOpen(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar fijo en tablet/desktop */}
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      {/* Drawer móvil */}
      {mobileNavOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-label="Cerrar menú"
            onClick={closeMobileNav}
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden max-w-[85vw]">
            <Sidebar
              className="min-h-full h-full shadow-2xl pt-[env(safe-area-inset-top)]"
              onNavigate={closeMobileNav}
              onClose={closeMobileNav}
            />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior solo en móvil */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <p className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">{appName}</p>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {loading && !profile && (
            <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
              Cargando perfil…
            </div>
          )}
          {!loading && !profile && (
            <div className="max-w-md mx-auto mt-8 md:mt-12 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">No se encontró el perfil de usuario.</p>
              <p className="mt-1 text-amber-800/95">
                Puede cerrar sesión e ingresar de nuevo. Si el problema continúa, contacte al administrador.
              </p>
            </div>
          )}
          {profile && <Outlet />}
        </main>
      </div>
    </div>
  )
}
