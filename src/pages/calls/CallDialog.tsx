import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Call, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { FileText } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  call: Call | null
  companies: Company[]
  contacts: Contact[]
  kams: Profile[]
  onSaved: () => void
  onCreateQuote?: (call: Call) => void
}

type FormState = {
  type: string
  company_id: string
  contact_id: string
  kam_id: string
  called_at: string
  outcome: string
  notes: string
  next_contact_date: string
}

const toLocalDatetime = () => {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  const local = new Date(now.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

const getEmpty = (kamId: string): FormState => ({
  type: 'llamada',
  company_id: '',
  contact_id: '',
  kam_id: kamId,
  called_at: toLocalDatetime(),
  outcome: 'sin_resultado',
  notes: '',
  next_contact_date: '',
})

export default function CallDialog({ open, onClose, call, companies, contacts, kams, onSaved, onCreateQuote }: Props) {
  const { profile } = useAuth()
  const [form, setForm] = useState<FormState>(getEmpty(''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredContacts = contacts.filter(c => c.company_id === form.company_id)

  const handleCompanyChange = async (companyId: string) => {
    setForm(prev => ({ ...prev, company_id: companyId, contact_id: '' }))
    if (profile?.role !== 'kam') {
      const { data } = await supabase
        .from('company_kams')
        .select('kam_id')
        .eq('company_id', companyId)
        .eq('is_lead', true)
        .single()
      if (data?.kam_id) {
        setForm(prev => ({ ...prev, company_id: companyId, contact_id: '', kam_id: data.kam_id }))
      }
    }
  }

  useEffect(() => {
    if (call) {
      const offset = new Date().getTimezoneOffset()
      const local = new Date(new Date(call.called_at).getTime() - offset * 60000)
      setForm({
        type:              call.type,
        company_id:        call.company_id,
        contact_id:        call.contact_id ?? '',
        kam_id:            call.kam_id,
        called_at:         local.toISOString().slice(0, 16),
        outcome:           call.outcome,
        notes:             call.notes ?? '',
        next_contact_date: call.next_contact_date ?? '',
      })
    } else {
      setForm(getEmpty(profile?.id ?? ''))
    }
    setError(null)
  }, [call, open, profile])

  const set = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  // Persiste la llamada y devuelve el objeto guardado
  const persist = async (): Promise<Call | null> => {
    if (!form.company_id) { setError('Selecciona una empresa'); return null }
    if (!form.kam_id)     { setError('Selecciona un KAM'); return null }
    setLoading(true)
    setError(null)

    const localDate = new Date(form.called_at)
    const utcDate   = new Date(localDate.getTime() + localDate.getTimezoneOffset() * 60000)

    const payload = {
      type:              form.type,
      company_id:        form.company_id,
      contact_id:        form.contact_id || null,
      kam_id:            form.kam_id,
      called_at:         utcDate.toISOString(),
      outcome:           form.outcome,
      notes:             form.notes || null,
      next_contact_date: form.next_contact_date || null,
    }

    try {
      const result = call
        ? await supabase.from('calls').update(payload).eq('id', call.id).select().single()
        : await supabase.from('calls').insert(payload).select().single()

      if (result.error) { setError(result.error.message); return null }
      return result.data as Call
    } catch {
      setError('Error inesperado')
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    const saved = await persist()
    if (!saved) return
    onSaved()
    onClose()
  }

  const handleSaveAndQuote = async () => {
    const saved = await persist()
    if (!saved) return
    onSaved()
    onClose()
    onCreateQuote?.(saved)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{call ? 'Editar interacción' : 'Nueva interacción'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">

            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llamada">📞 Llamada</SelectItem>
                  <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                  <SelectItem value="email">✉️ Email</SelectItem>
                  <SelectItem value="reunion">👥 Reunión</SelectItem>
                  <SelectItem value="visita">📍 Visita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Fecha y hora *</Label>
              <Input
                type="datetime-local"
                value={form.called_at}
                onChange={e => set('called_at', e.target.value)}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Empresa *</Label>
              <Select value={form.company_id} onValueChange={handleCompanyChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Contacto</Label>
              <Select
                value={form.contact_id}
                onValueChange={v => set('contact_id', v)}
                disabled={!form.company_id}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={form.company_id ? 'Selecciona un contacto' : 'Primero selecciona una empresa'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredContacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>KAM</Label>
              <Select
                value={form.kam_id}
                onValueChange={v => set('kam_id', v)}
                disabled={profile?.role === 'kam'}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un KAM" />
                </SelectTrigger>
                <SelectContent>
                  {kams.map(k => (
                    <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profile?.role === 'kam' && (
                <p className="text-xs text-gray-400">Asignado automáticamente a tu usuario</p>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Resultado *</Label>
              <Select value={form.outcome} onValueChange={v => set('outcome', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_resultado">Sin resultado</SelectItem>
                  <SelectItem value="interesado">Interesado</SelectItem>
                  <SelectItem value="no_interesado">No interesado</SelectItem>
                  <SelectItem value="requiere_seguimiento">Requiere seguimiento</SelectItem>
                  <SelectItem value="cotizacion_solicitada">Cotización solicitada</SelectItem>
                  <SelectItem value="venta_cerrada">Venta cerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Próximo contacto</Label>
              <Input
                type="date"
                value={form.next_contact_date}
                onChange={e => set('next_contact_date', e.target.value)}
              />
              <p className="text-xs text-gray-400">
                Si se ingresa una fecha, se creará una actividad de seguimiento automáticamente.
              </p>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Resumen de la interacción..."
                rows={4}
              />
            </div>

          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          {onCreateQuote && (
            <Button
              variant="outline"
              className="mr-auto gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              onClick={handleSaveAndQuote}
              disabled={loading}
            >
              <FileText size={14} />
              {loading ? 'Guardando...' : 'Guardar y crear cotización'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}