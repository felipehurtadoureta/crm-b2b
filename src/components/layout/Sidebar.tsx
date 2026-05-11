import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Building2, Users, Phone,
  TrendingUp, FileText, Package, ShoppingBag, LogOut
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'

const navItems = [
  { label: 'Dashboard',        href: '/',          icon: LayoutDashboard },
  { label: 'Empresas',         href: '/companies', icon: Building2 },
  { label: 'Contactos',        href: '/contacts',  icon: Users },
  { label: 'Llamadas',         href: '/calls',     icon: Phone },
  { label: 'Negocios',         href: '/deals',     icon: TrendingUp },
  { label: 'Cotizaciones',     href: '/quotes',    icon: FileText },
  { label: 'Órdenes de Venta', href: '/sales',     icon: ShoppingBag },
  { label: 'Productos',        href: '/products',  icon: Package },
]

export default function Sidebar() {
  const location = useLocation()
  const { profile, signOut } = useAuth()

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '??'

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight">CRM B2B</h1>
        <p className="text-xs text-gray-400 mt-0.5">Panel de gestión</p>
      </div>

      <Separator className="bg-gray-700" />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = location.pathname === href
          return (
            <Link key={href} to={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-gray-700 text-white font-medium'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}>
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-gray-700" />

      <div className="px-4 py-4 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-gray-600 text-white text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{profile?.full_name}</p>
          <p className="text-xs text-gray-400 truncate">{profile?.role}</p>
        </div>
        <button onClick={signOut}
          className="text-gray-400 hover:text-white transition-colors" title="Cerrar sesión">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}