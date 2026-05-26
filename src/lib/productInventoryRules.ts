import type { Product, ProductType } from '@/types'

/**
 * @deprecated Las cotizaciones ya no sincronizan inventario.
 * Se mantiene solo para datos legacy / migración.
 */
export function productTracksSerialStock(p: Pick<Product, 'type' | 'has_inventory'>): boolean {
  const t = p.type as ProductType
  if (t === 'service') return false
  if (t === 'inventory') return true
  return !!(p.has_inventory ?? false)
}
