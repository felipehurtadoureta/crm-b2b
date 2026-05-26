/**
 * Admin: conexiones SII multi-RUT (importación manual desde archivos del portal SII).
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchSiiConnections, fmtSiiLastSync, SII_CONNECTIONS_QUERY_KEY } from '@/lib/siiConnectionsQuery'
import { invokeSiiConnectionDelete, invokeSiiConnectionUpsert } from '@/lib/siiSync'
import type { SiiConnection } from '@/types'

type FormState = {
  id?: string
  rut: string
  legal_name: string
  initial_sync_months: number
  is_active: boolean
}

const emptyForm = (): FormState => ({
  rut: '',
  legal_name: '',
  initial_sync_months: 12,
  is_active: true,
})

export default function SiiConnectionsSection() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [localError, setLocalError] = useState<string | null>(null)

  const connectionsQ = useQuery({
    queryKey: SII_CONNECTIONS_QUERY_KEY,
    queryFn: fetchSiiConnections,
  })

  const saveMut = useMutation({
    mutationFn: () =>
      invokeSiiConnectionUpsert({
        id: form.id,
        rut: form.rut.trim(),
        legal_name: form.legal_name.trim(),
        is_active: form.is_active,
        initial_sync_months: form.initial_sync_months,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SII_CONNECTIONS_QUERY_KEY })
      setDialogOpen(false)
      setForm(emptyForm())
      setLocalError(null)
    },
    onError: (e: Error) => setLocalError(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: invokeSiiConnectionDelete,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SII_CONNECTIONS_QUERY_KEY })
    },
  })

  const openCreate = () => {
    setForm(emptyForm())
    setLocalError(null)
    setDialogOpen(true)
  }

  const openEdit = (c: SiiConnection) => {
    setForm({
      id: c.id,
      rut: c.rut,
      legal_name: c.legal_name,
      initial_sync_months: c.initial_sync_months,
      is_active: c.is_active,
    })
    setLocalError(null)
    setDialogOpen(true)
  }

  const handleDelete = (c: SiiConnection) => {
    if (
      !window.confirm(
        `¿Eliminar la conexión SII de ${c.legal_name} (${c.rut})? Se borrarán también los documentos importados.`,
      )
    ) {
      return
    }
    deleteMut.mutate(c.id)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Conexiones SII</h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Registre cada RUT/contribuyente. Descargue el RCV en www.sii.cl e impórtelo en la sección SII (RCV) del menú
            Banco.
          </p>
        </div>
        <Button type="button" size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus size={14} />
          Nueva conexión
        </Button>
      </div>

      {connectionsQ.isLoading && <p className="text-sm text-gray-400">Cargando conexiones…</p>}
      {connectionsQ.isError && (
        <p className="text-sm text-red-600">{(connectionsQ.error as Error).message}</p>
      )}

      {!connectionsQ.isLoading && (connectionsQ.data?.length ?? 0) === 0 && (
        <p className="text-sm text-gray-400">Sin conexiones. Cree la primera para importar documentos.</p>
      )}

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
        {(connectionsQ.data ?? []).map(c => (
          <li key={c.id} className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-gray-900">{c.legal_name}</p>
              <p className="text-xs text-gray-500 font-mono">{c.rut}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {c.is_active ? 'Activa' : 'Inactiva'} · Últ. sync {fmtSiiLastSync(c.last_sync_at)}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => openEdit(c)}>
                <Pencil size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 text-red-500"
                disabled={deleteMut.isPending}
                onClick={() => handleDelete(c)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar conexión SII' : 'Nueva conexión SII'}</DialogTitle>
          </DialogHeader>

          {localError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{localError}</div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="siiRut">RUT contribuyente *</Label>
              <Input
                id="siiRut"
                value={form.rut}
                onChange={e => setForm({ ...form, rut: e.target.value })}
                placeholder="76123456-7"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="siiLegalName">Razón social *</Label>
              <Input
                id="siiLegalName"
                value={form.legal_name}
                onChange={e => setForm({ ...form, legal_name: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-500 rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
              La clave tributaria no se guarda en el CRM. Descargue el RCV en el portal del SII e impórtelo como archivo
              en Documentos tributarios (SII).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="siiInitialMonths">Meses de historial (referencia)</Label>
                <Input
                  id="siiInitialMonths"
                  type="number"
                  min={1}
                  max={36}
                  value={form.initial_sync_months}
                  onChange={e =>
                    setForm({ ...form, initial_sync_months: Math.min(36, Math.max(1, Number(e.target.value) || 12)) })
                  }
                />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Conexión activa
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
