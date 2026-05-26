import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import InventoryPanel from '@/pages/products/InventoryPanel'

const SELECT_IN_MODAL = 'z-[200] max-h-60 overflow-y-auto'

interface ProductOption {
  id: string
  name: string
  sku?: string
}

interface Props {
  open: boolean
  /** Si viene definido, se usa directamente; si no, el usuario elige producto */
  productId?: string | null
  productName?: string
  onClose: () => void
  onChanged: () => void
}

export default function InventoryManageDialog({
  open,
  productId: initialProductId,
  productName: initialProductName,
  onClose,
  onChanged,
}: Props) {
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')

  const effectiveId = initialProductId || selectedId
  const effectiveName =
    initialProductName ||
    products.find(p => p.id === selectedId)?.name ||
    ''

  useEffect(() => {
    if (!open) return
    setSelectedId(initialProductId ?? '')
  }, [open, initialProductId])

  useEffect(() => {
    if (!open || initialProductId) return
    setLoadingProducts(true)
    supabase
      .from('products')
      .select('id, name, sku')
      .eq('is_active', true)
      .neq('type', 'service')
      .order('name')
      .then(({ data, error }) => {
        if (!error) setProducts((data ?? []) as ProductOption[])
        setLoadingProducts(false)
      })
  }, [open, initialProductId])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[min(92vh,44rem)] flex flex-col gap-3 p-0 overflow-hidden sm:max-w-2xl">
        <DialogHeader className="px-4 pt-4 pb-0 shrink-0 text-left">
          <DialogTitle className="text-base">
            {effectiveName ? `Seriales — ${effectiveName}` : 'Agregar unidad al inventario'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Registre números de serie, custodia y estado. Las cotizaciones no modifican este inventario.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 shrink-0 space-y-2">
          {!initialProductId && (
            <div className="space-y-1">
              <Label className="text-xs">Producto *</Label>
              <Select
                value={selectedId || '__none__'}
                onValueChange={v => setSelectedId(v === '__none__' ? '' : v)}
                disabled={loadingProducts}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={loadingProducts ? 'Cargando…' : 'Seleccione producto'} />
                </SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL}>
                  <SelectItem value="__none__">Seleccione producto</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` (${p.sku})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {products.length === 0 && !loadingProducts && (
                <p className="text-xs text-amber-700">
                  No hay productos físicos activos. Créelos en el módulo Productos primero.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {effectiveId ? (
            <InventoryPanel
              key={effectiveId}
              productId={effectiveId}
              variant="dialog"
              onItemsChanged={onChanged}
            />
          ) : (
            <p className="text-sm text-gray-500 py-6 text-center">
              Elija un producto para agregar o editar seriales.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
