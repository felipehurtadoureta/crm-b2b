import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CalendarDays,
  Building2,
  Users,
  FileText,
  Package,
  Warehouse,
  Shield,
  Settings,
  LogOut,
  Upload,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'
import { useCrmAppSettings } from '@/hooks/useCrmAppSettings'
import { mergeCrmAppSettings } from '@/lib/crmAppSettings'
import { navItemsForRole, type NavItemId } from '@/lib/permissions'

const ICON_MAP: Record<NavItemId, LucideIcon> = {
  dashboard:          LayoutDashboard,
  agenda:             CalendarDays,
  companies:          Building2,
  contacts:           Users,
  quotes:             FileText,
  products:           Package,
  inventory:          Warehouse,
  admin_organization: Settings,
  admin_users:        Shield,
  admin_import:       Upload,
}

export default function Sidebar() {
  const location = useLocation()
  const { profile, signOut, loading: profileLoading } = useAuth()
  const branding = useCrmAppSettings()
  const [logoBroken, setLogoBroken] = useState(false)

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '??'

  const items = navItemsForRole(profile?.role)
  const navSkeleton = profileLoading && !profile

  const m = branding.data ?? mergeCrmAppSettings(null)
  const showLogo = Boolean(m.logoUrl) && !logoBroken

  useEffect(() => {
    setLogoBroken(false)
  }, [m.logoUrl])

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Marca (logo + nombre producto) */}
      <div className="px-5 pt-5 pb-4 shrink-0">
        {showLogo && (
          <img
            src={m.logoUrl!}
            alt=""
            className="h-10 max-w-[9.5rem] object-contain mb-2"
            onError={() => setLogoBroken(true)}
          />
        )}
        <h1 className="text-lg font-semibold tracking-tight leading-tight">{m.displayName}</h1>
        <p className="text-xs text-gray-400 mt-1 leading-snug">{m.tagline}</p>
      </div>

      <Separator className="bg-gray-700 shrink-0" />

      {/* Usuario debajo del logo */}
      <div className="px-4 py-3 flex items-center gap-3 shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-gray-600 text-white text-xs">
            {navSkeleton ? '…' : initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          {navSkeleton ? (
            <>
              <div className="h-3.5 w-28 rounded bg-gray-700 animate-pulse mb-2" />
              <div className="h-3 w-16 rounded bg-gray-800 animate-pulse" />
            </>
          ) : (
            <>
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{profile?.role}</p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={navSkeleton}
          className={cn(
            'transition-colors shrink-0',
            navSkeleton ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white',
          )}
          title="Cerrar sesión"
        >
          <LogOut size={16} />
        </button>
      </div>

      <Separator className="bg-gray-700 shrink-0" />

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto min-h-0">
        {navSkeleton ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-9 rounded-md bg-gray-800/80 animate-pulse"
                aria-hidden
              />
            ))}
          </>
        ) : (
          items.map(({ id, label, href }) => {
            const Icon = ICON_MAP[id]
            const active = location.pathname === href || (href !== '/' && location.pathname.startsWith(href))
            return (
              <Link
                key={href}
                to={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-gray-700 text-white font-medium'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            )
          })
        )}
      </nav>
    </aside>
  )
}
