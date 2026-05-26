import { useEffect, useState } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Company, InventoryCustody, ProductCurrency } from '@/types'
import { Loader2 } from 'lucide-react'

const SELECT_IN_MODAL = 'z-[200] max-h-60 overflow-y-auto'

const CUSTODY_OPTIONS: { value: InventoryCustody; label: string }[] = [
  { value: 'bodega', label: 'Bodega' },
  { value: 'en_cliente', label: 'En cliente' },
  { value: 'prestamo', label: 'Préstamo' },
  { value: 'transito', label: 'Tránsito' },
]

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'vendido', label: 'Vendido' },
  { value: 'dañado', label: 'Dañado' },
]

export interface InventoryItemEditRow {
  id: string
  product_id: string
  serial_number: string
  status: string
  custody?: string
  notes?: string | null
  destination_notes?: string | null
  installed_address?: string | null
  reference_price?: number | null
  reference_currency?: string | null
  custody_company_id?: string | null
  products?: { name: string }
}

interface Props {
  open: boolean
  item: InventoryItemEditRow | null
  companies: Company[]
  onClose: () => void
  onSaved: () => void
}

export default function InventoryItemEditDialog({
  open,
  item,
  companies,
  onClose,
  onSaved,
}: Props) {
  const [serial, setSerial] = useState('')
  const [notes, setNotes] = useState('')
  const [custody, setCustody] = useState<InventoryCustody>('bodega')
  const [status, setStatus] = useState('disponible')
  const [installedAddress, setInstalledAddress] = useState('')
  const [destinationNotes, setDestinationNotes] = useState('')
  const [refPrice, setRefPrice] = useState('')
  const [refCurrency, setRefCurrency] = useState<ProductCurrency>('CLP')
  const [companyId, setCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isVendido = status === 'vendido'

  useEffect(() => {
    if (!open || !item) return
    setSerial(item.serial_number)
    setNotes(item.notes ?? '')
    setCustody((item.custody as InventoryCustody) ?? 'bodega')
    setStatus(item.status)
    setInstalledAddress(item.installed_address ?? '')
    setDestinationNotes(item.destination_notes ?? '')
    setRefPrice(item.reference_price != null ? String(item.reference_price) : '')
    setRefCurrency((item.reference_currency as ProductCurrency) ?? 'CLP')
    setCompanyId(item.custody_company_id ?? '')
    setError(null)
  }, [open, item])

  async function handleSave() {
    if (!item) return
    const serialTrim = serial.trim()
    if (!serialTrim) {
      setError('El número de serie es obligatorio.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const parsedRef = parseFloat(refPrice.replace(',', '.'))
      const payload: Record<string, unknown> = {
        serial_number: serialTrim,
        notes: notes.trim() || null,
        custody,
        status,
        installed_address: installedAddress.trim() || null,
        destination_notes: destinationNotes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (!Number.isNaN(parsedRef) && parsedRef >= 0) {
        payload.reference_price = parsedRef
        payload.reference_currency = refCurrency
      } else {
        payload.reference_price = null
        payload.reference_currency = null
      }
      if (custody === 'en_cliente' || status === 'vendido') {
        payload.custody_company_id = companyId || null
      } else {
        payload.custody_company_id = null
      }

      const { error: upErr } = await supabase
        .from('inventory_items')
        .update(payload)
        .eq('id', item.id)
      if (upErr) throw upErr

      onSaved()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? 'No se pudo guardar.'
      if (msg.includes('duplicate') || msg.includes('unique')) {
        setError('Ese número de serie ya existe para este producto.')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Editar unidad</DialogTitle>
          <DialogDescription className="text-xs">
            {item.products?.name ?? 'Producto'} · serie actual en inventario
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <Label className="text-xs">N° de serie *</Label>
            <Input
              value={serial}
              onChange={e => setSerial(e.target.value)}
              className="font-mono text-sm"
              disabled={isVendido}
            />
            {isVendido && (
              <p className="text-[11px] text-gray-500">El serial no se modifica en unidades vendidas.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL}>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Custodia</Label>
              <Select
                value={custody}
                onValueChange={v => setCustody(v as InventoryCustody)}
                disabled={isVendido}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL}>
                  {CUSTODY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(custody === 'en_cliente' || status === 'vendido') && (
            <div className="space-y-1">
              <Label className="text-xs">Empresa cliente (opcional)</Label>
              <Select value={companyId || '__none__'} onValueChange={v => setCompanyId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL}>
                  <SelectItem value="__none__">Sin empresa</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Observaciones internas"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Dirección de instalación</Label>
            <Input
              value={installedAddress}
              onChange={e => setInstalledAddress(e.target.value)}
              className="h-9 text-sm"
              placeholder="Opcional"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notas de destino</Label>
            <Textarea
              value={destinationNotes}
              onChange={e => setDestinationNotes(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Referencia de entrega, cotización, etc."
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">Valor referencia</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={refPrice}
                onChange={e => setRefPrice(e.target.value)}
                className="h-9 text-sm"
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1 w-24">
              <Label className="text-xs">Moneda</Label>
              <Select value={refCurrency} onValueChange={v => setRefCurrency(v as ProductCurrency)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className={SELECT_IN_MODAL}>
                  <SelectItem value="CLP">CLP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UF">UF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin mr-1" /> Guardando…</> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
