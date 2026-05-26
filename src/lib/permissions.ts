import type { Role } from '@/types'

/** Rutas que el lector puede abrir (solo lectura en pantallas; botones ya usan `canEdit`). */
const READER_PATH_PREFIXES = ['/', '/agenda', '/companies', '/contacts', '/quotes', '/sales', '/invoices', '/documents']

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
  if (pathname.startsWith('/bank/glosas')) {
    return false
  }
  if (pathMatchesPrefix(pathname, ['/bank', '/sii'])) {
    return role === 'kam'
  }
  if (pathMatchesPrefix(pathname, KAM_OR_ADMIN_PREFIXES)) {
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
  | 'invoices'
  | 'documents'
  | 'admin_users'
  | 'bank_book'
  | 'sii_documents'

export interface NavItemConfig {
  id: NavItemId
  label: string
  href: string
  roles: Role[]
}

export interface NavGroupConfig {
  id: string
  title: string
  roles: Role[]
  items: NavItemConfig[]
}

export type NavEntry =
  | { type: 'item'; item: NavItemConfig }
  | { type: 'group'; group: NavGroupConfig }

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'agenda', label: 'Agenda', href: '/agenda', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'companies', label: 'Empresas', href: '/companies', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'contacts', label: 'Contactos', href: '/contacts', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'quotes', label: 'Cotizaciones', href: '/quotes', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'products', label: 'Productos', href: '/products', roles: ['super_admin', 'kam'] },
  { id: 'inventory', label: 'Inventario', href: '/inventory', roles: ['super_admin', 'kam'] },
  { id: 'invoices', label: 'Facturas', href: '/invoices', roles: ['super_admin', 'kam', 'reader'] },
  { id: 'documents', label: 'Documentos', href: '/documents', roles: ['super_admin', 'kam', 'reader'] },
]

const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'banco',
    title: 'Banco',
    roles: ['super_admin', 'kam'],
    items: [
      { id: 'bank_book', label: 'Libro de banco', href: '/bank', roles: ['super_admin', 'kam'] },
      { id: 'sii_documents', label: 'SII (RCV)', href: '/sii', roles: ['super_admin', 'kam'] },
    ],
  },
  {
    id: 'admin',
    title: 'Usuarios',
    roles: ['super_admin'],
    items: [{ id: 'admin_users', label: 'Administración', href: '/admin/users', roles: ['super_admin'] }],
  },
]

/** Estructura del menú lateral (ítems sueltos + secciones agrupadas). */
export const NAV_STRUCTURE: NavEntry[] = [
  ...NAV_ITEMS.map(item => ({ type: 'item' as const, item })),
  ...NAV_GROUPS.map(group => ({ type: 'group' as const, group })),
]

/** @deprecated Use navStructureForRole — lista plana legacy. */
export const NAV_ITEMS_CONFIG: NavItemConfig[] = [
  ...NAV_ITEMS,
  ...NAV_GROUPS.flatMap(g => g.items),
]

export function navStructureForRole(role: Role | undefined): NavEntry[] {
  if (!role) return []
  return NAV_STRUCTURE.filter(entry => {
    if (entry.type === 'item') return entry.item.roles.includes(role)
    return entry.group.roles.includes(role)
  }).map(entry => {
    if (entry.type === 'group') {
      return {
        type: 'group' as const,
        group: {
          ...entry.group,
          items: entry.group.items.filter(i => i.roles.includes(role)),
        },
      }
    }
    return entry
  }).filter(entry => entry.type !== 'group' || entry.group.items.length > 0)
}

export function navItemsForRole(role: Role | undefined): NavItemConfig[] {
  return navStructureForRole(role).flatMap(e =>
    e.type === 'item' ? [e.item] : e.group.items,
  )
}

/** Pestañas dentro de /admin/users (organización e importación viven ahí). */
export type AdminSettingsTab = 'users' | 'organization' | 'import'

export function adminTabFromPath(pathname: string, search: string): AdminSettingsTab {
  const tab = new URLSearchParams(search).get('tab')
  if (tab === 'organization' || tab === 'import') return tab
  if (pathname === '/admin/organization') return 'organization'
  if (pathname === '/admin/import') return 'import'
  return 'users'
}
