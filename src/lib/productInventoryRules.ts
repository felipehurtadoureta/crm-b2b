import type { Product, ProductType } from '@/types'

/** Producto físico que gestiona números de serie en `inventory_items` (reserva en cotización). */
export function productTracksSerialStock(p: Pick<Product, 'type' | 'has_inventory'>): boolean {
  const t = p.type as ProductType
  if (t === 'service') return false
  /** Datos legacy: `inventory` equivalía a físico con stock serial */
  if (t === 'inventory') return true
  return !!(p.has_inventory ?? false)
}
