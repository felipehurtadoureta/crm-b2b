import type { Role } from '@/types'

/** Rutas que el lector puede abrir (solo lectura en pantallas; botones ya usan `canEdit`). */
const READER_PATH_PREFIXES = ['/', '/agenda', '/companies', '/contacts', '/quotes', '/sales']

/** Prefijos solo para KAM y super_admin (p. ej. prospección y catálogo). */
const KAM_OR_ADMIN_PREFIXES = ['/calls', '/products', '/inventory']

const ADMIN_ONLY_PREFIXES = ['/admin']

function pathMatchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(p => {
    if (p === '/') return pathname === '/' || pathname === ''
    return pathname === p || pathname.startsWith(`${p}/`)
  })
}

/** ¿Puede este rol abrir esta ruta del CRM? (sidebar + guard en rutas). */
export function roleCanAccessPath(role: Role | undefined, pathname: string): boolean {
  if (!role) return false
  if (role === 'super_admin') return true
  if (pathMatchesPrefix(pathname, ADMIN_ONLY_PREFIXES)) return false
  if (pathMatchesPrefix(pathname, KAM_OR_ADMIN_PREFIXES)) {
    // `super_admin` ya retornó arriba; aquí solo KAM
    return role === 'kam'
  }
  if (role === 'reader') {
    return pathMatchesPrefix(pathname, READER_PATH_PREFIXES)
  }
  return true
}

export type NavItemId =
  | 'dashboard'
  | 'agenda'
  | 'companies'
  | 'contacts'
  | 'quotes'
  | 'products'
  | 'inventory'
  | 'admin_organization'
  | 'admin_users'
  | 'admin_import'

export interface NavItemConfig {
  id: NavItemId
  label: string
  href: string
  roles: Role[]
}

export const NAV_ITEMS_CONFIG: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'agenda', label: 'Agenda', href: '/agenda', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'companies', label: 'Empresas', href: '/companies', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'contacts', label: 'Contactos', href: '/contacts', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'quotes', label: 'Cotizaciones', href: '/quotes', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'products', label: 'Productos', href: '/products', roles: ['super_admin', 'kam'] },
  { id: 'inventory', label: 'Inventario', href: '/inventory', roles: ['super_admin', 'kam'] },
  { id: 'admin_organization', label: 'Organización', href: '/admin/organization', roles: ['super_admin'] },
  { id: 'admin_users', label: 'Usuarios', href: '/admin/users', roles: ['super_admin'] },
  { id: 'admin_import', label: 'Importar Excel', href: '/admin/import', roles: ['super_admin'] },
]

export function navItemsForRole(role: Role | undefined): NavItemConfig[] {
  if (!role) return []
  return NAV_ITEMS_CONFIG.filter(n => n.roles.includes(role))
}
