import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Company, InventoryCustody } from '@/types'
import { Loader2 } from 'lucide-react'

/** z-index por encima del overlay del Dialog (z-50) para que los desplegables reciban clics */
const SELECT_IN_MODAL_CLASS = 'z-[200] max-h-60 overflow-y-auto'

export type InventoryExitReason = 'venta' | 'transito' | 'danio'

export interface InventoryExitItem {
  id: string
  serial_number: string
  product_id: string
  product_name: string
}

interface Props {
  open: boolean
  items: InventoryExitItem[]
  companies: Company[]
  onClose: () => void
  onCompleted: () => void
}

const REASON_LABEL: Record<InventoryExitReason, string> = {
  venta: 'Venta (entrega a cliente)',
  transito: 'Salida de bodega / tránsito',
  danio: 'Daño o baja',
}

export default function InventoryExitDialog({
  open,
  items,
  companies,
  onClose,
  onCompleted,
}: Props) {
  const [reason, setReason] = useState<InventoryExitReason>('venta')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [companyId, setCompanyId] = useState('')
  const [installedAddress, setInstalledAddress] = useState('')
  const [destinationNotes, setDestinationNotes] = useState('')
  const [filterProduct, setFilterProduct] = useState('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disponibles = useMemo(() => items, [items])

  const productOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of disponibles) {
      if (!m.has(i.product_id)) m.set(i.product_id, i.product_name)
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [disponibles])

  const visible = useMemo(() => {
    if (filterProduct === 'all') return disponibles
    return disponibles.filter(i => i.product_id === filterProduct)
  }, [disponibles, filterProduct])

  useEffect(() => {
    if (!open) return
    setReason('venta')
    setSelected(new Set())
    setCompanyId('')
    setInstalledAddress('')
    setDestinationNotes('')
    setFilterProduct('all')
    setError(null)
  }, [open])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelected(new Set(visible.map(i => i.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleSubmit() {
    setError(null)
    const ids = [...selected]
    if (!ids.length) {
      setError('Seleccione al menos una unidad disponible.')
      return
    }

    let status: string
    let custody: InventoryCustody
    if (reason === 'venta') {
      status = 'vendido'
      custody = 'en_cliente'
    } else if (reason === 'danio') {
      status = 'dañado'
      custody = 'bodega'
    } else {
      status = 'disponible'
      custody = 'transito'
    }

    const payload: Record<string, unknown> = {
      status,
      custody,
      destination_notes: destinationNotes.trim() || null,
      installed_address: installedAddress.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (reason === 'venta') {
      payload.custody_company_id = companyId || null
    } else {
      payload.custody_company_id = null
    }

    setSaving(true)
    try {
      const { error: upErr } = await supabase.from('inventory_items').update(payload).in('id', ids)
      if (upErr) throw upErr
      onCompleted()
      onClose()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'No se pudo registrar la salida.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader className="px-4 py-3 border-b border-gray-200 shrink-0 text-left">
          <DialogTitle className="text-sm font-semibold">Registrar salida de inventario</DialogTitle>
          <DialogDescription className="text-xs">
            {disponibles.length === 0
              ? 'No hay unidades en estado «Disponible». Si quedaron en «Reservado» por cotizaciones antiguas, ejecute el script de limpieza en Supabase o cambie el estado manualmente.'
              : `${disponibles.length} unidad(es) disponible(s). Haga clic en los números de serie para seleccionarlos.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          <div className="space-y-1">
            <Label className="text-xs">Motivo</Label>
            <Select value={reason} onValueChange={v => setReason(v as InventoryExitReason)}>
              <SelectTrigger className="w-full text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className={SELECT_IN_MODAL_CLASS}>
                {(Object.keys(REASON_LABEL) as InventoryExitReason[]).map(k => (
                  <SelectItem key={k} value={k}>{REASON_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === 'venta' && (
            <div className="space-y-1">
              <Label className="text-xs">Empresa cliente (opcional)</Label>
              <Select value={companyId || '__none__'} onValueChange={v => setCompanyId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="w-full text-sm"><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL_CLASS}>
                  <SelectItem value="__none__">Sin empresa</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Input
              placeholder="Dirección de instalación (opcional)"
              className="h-8 text-xs"
              value={installedAddress}
              onChange={e => setInstalledAddress(e.target.value)}
            />
            <Textarea
              placeholder="Notas de destino o referencia (ej. cotización COT-2025-0001)"
              rows={2}
              className="text-xs"
              value={destinationNotes}
              onChange={e => setDestinationNotes(e.target.value)}
            />
          </div>

          {disponibles.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-gray-600 shrink-0">Filtrar producto</Label>
                <Select value={filterProduct} onValueChange={setFilterProduct}>
                  <SelectTrigger className="h-8 w-full max-w-xs text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className={SELECT_IN_MODAL_CLASS}>
                    <SelectItem value="all">Todos</SelectItem>
                    {productOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-600">{selected.size} de {visible.length} seleccionada(s)</span>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllVisible}>
                  Seleccionar visibles
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                  Limpiar
                </Button>
              </div>

              {visible.length === 0 ? (
                <p className="text-sm text-amber-700">Ninguna unidad con el filtro actual. Elija «Todos» en el filtro de producto.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50/50">
                  {visible.map(item => {
                    const on = selected.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={`text-xs font-mono px-2 py-1.5 rounded-md border transition-colors cursor-pointer ${
                          on
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-violet-400 hover:bg-violet-50'
                        }`}
                        title={item.product_name}
                      >
                        {item.serial_number}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="px-4 py-3 shrink-0 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || disponibles.length === 0}>
            {saving ? <><Loader2 size={14} className="animate-spin mr-1" /> Guardando…</> : 'Confirmar salida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
