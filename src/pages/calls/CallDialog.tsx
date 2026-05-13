import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Call, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { FilePlus } from 'lucide-react'

interface Props {
  open:             boolean
  onClose:          () => void
  call:             Call | null
  companies:        Company[]
  contacts:         Contact[]
  kams:             Profile[]
  onSaved:          () => void
  initialQuoteId?:   string
  initialCompanyId?: string
  initialContactId?: string
  initialKamId?:     string
}

type FormState = {
  type:              string
  company_id:        string
  contact_id:        string
  kam_id:            string
  called_at:         string
  outcome:           string
  notes:             string
  next_contact_date: string
}

const toLocalDatetime = () => {
  const now    = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 16)
}

const getEmpty = (kamId: string, companyId = '', contactId = ''): FormState => ({
  type: 'llamada', company_id: companyId, contact_id: contactId,
  kam_id: kamId, called_at: toLocalDatetime(),
  outcome: 'sin_resultado', notes: '', next_contact_date: '',
})

const SELECT_Z = 'z-[200]'

export default function CallDialog({
  open, onClose, call, companies, contacts, kams, onSaved,
  initialQuoteId, initialCompanyId, initialContactId, initialKamId,
}: Props) {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [form, setForm]   = useState<FormState>(getEmpty(''))
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fromQuote       = !!initialQuoteId
  const filteredContacts = contacts.filter(c => c.company_id === form.company_id)

  const handleCompanyChange = async (companyId: string) => {
    setForm(prev => ({ ...prev, company_id: companyId, contact_id: '' }))
    if (profile?.role !== 'kam') {
      const { data } = await supabase
        .from('company_kams').select('kam_id')
        .eq('company_id', companyId).eq('is_lead', true).single()
      if (data?.kam_id)
        setForm(prev => ({ ...prev, company_id: companyId, contact_id: '', kam_id: data.kam_id }))
    }
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    if (call) {
      const offset = new Date().getTimezoneOffset()
      const local  = new Date(new Date(call.called_at).getTime() - offset * 60000)
      setForm({
        type:              call.type,
        company_id:        call.company_id,
        contact_id:        call.contact_id  ?? '',
        kam_id:            call.kam_id,
        called_at:         local.toISOString().slice(0, 16),
        outcome:           call.outcome,
        notes:             call.notes       ?? '',
        next_contact_date: call.next_contact_date ?? '',
      })
    } else {
      setForm(getEmpty(
        initialKamId ?? profile?.id ?? '',
        initialCompanyId ?? '',
        initialContactId ?? '',
      ))
    }
  }, [open, call?.id]) // eslint-disable-line

  const set = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.company_id) { setError('Selecciona una empresa'); return }
    if (!form.kam_id)     { setError('Selecciona un KAM'); return }
    setLoading(true); setError(null)

    const localDate = new Date(form.called_at)
    const utcDate   = new Date(localDate.getTime() + localDate.getTimezoneOffset() * 60000)

    const payload: Record<string, unknown> = {
      type:              form.type,
      company_id:        form.company_id,
      contact_id:        form.contact_id || null,
      kam_id:            form.kam_id,
      called_at:         utcDate.toISOString(),
      outcome:           form.outcome,
      notes:             form.notes || null,
      next_contact_date: form.next_contact_date || null,
    }
    if (!call && initialQuoteId) payload.quote_id = initialQuoteId

    try {
      const result = call
        ? await supabase.from('calls').update(payload).eq('id', call.id).select()
        : await supabase.from('calls').insert(payload).select()
      if (result.error) { setError(result.error.message); return }
      onSaved(); onClose()
    } catch {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  // Crear cotización desde esta interacción
  const handleCreateQuote = () => {
    onClose()
    navigate('/quotes', {
      state: {
        openNew:   true,
        companyId: form.company_id || undefined,
        contactId: form.contact_id || undefined,
        callId:    call?.id        || undefined,
      }
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 150 }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {call ? 'Editar interacción' : 'Nueva interacción'}
            </h2>
            {fromQuote && !call && (
              <p className="text-xs text-blue-500 mt-0.5">Vinculada a cotización</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">

            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className={SELECT_Z}>
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
              <Input type="datetime-local" value={form.called_at}
                onChange={e => set('called_at', e.target.value)} />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Empresa *</Label>
              <Select
                value={form.company_id || '__none__'}
                onValueChange={v => v !== '__none__' && handleCompanyChange(v)}
                disabled={fromQuote && !!initialCompanyId}
              >
                <SelectTrigger><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                <SelectContent className={SELECT_Z}>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Contacto</Label>
              <Select
                value={form.contact_id || '__none__'}
                onValueChange={v => set('contact_id', v === '__none__' ? '' : v)}
                disabled={!form.company_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={form.company_id ? 'Opcional' : 'Primero selecciona una empresa'} />
                </SelectTrigger>
                <SelectContent className={SELECT_Z}>
                  <SelectItem value="__none__">— Sin contacto —</SelectItem>
                  {filteredContacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>KAM</Label>
              <Select
                value={form.kam_id || '__none__'}
                onValueChange={v => set('kam_id', v === '__none__' ? '' : v)}
                disabled={profile?.role === 'kam'}
              >
                <SelectTrigger><SelectValue placeholder="Selecciona un KAM" /></SelectTrigger>
                <SelectContent className={SELECT_Z}>
                  {kams.map(k => (
                    <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profile?.role === 'kam' && (
                <p className="text-xs text-gray-400">Asignado automáticamente</p>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Resultado *</Label>
              <Select value={form.outcome} onValueChange={v => set('outcome', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className={SELECT_Z}>
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
              <Input type="date" value={form.next_contact_date}
                onChange={e => set('next_contact_date', e.target.value)} />
              <p className="text-xs text-gray-400">
                Si se ingresa una fecha, se creará una actividad de seguimiento automáticamente.
              </p>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Resumen de la interacción..." rows={4} />
            </div>

          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center gap-2 shrink-0">
          {/* Botón crear cotización — solo si hay empresa seleccionada y no viene de una cotización */}
          {!fromQuote && form.company_id && profile?.role !== 'reader' && (
            <Button
              variant="outline"
              onClick={handleCreateQuote}
              className="mr-auto gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              disabled={loading}
            >
              <FilePlus size={14} /> Crear cotización
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Guardando...' : call ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}