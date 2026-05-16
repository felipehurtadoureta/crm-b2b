// src/pages/calls/CallDialog.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Call, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { OUTCOMES_PROSPECTION, OUTCOMES_QUOTE_FOLLOWUP, addDaysToTodayIso } from '@/lib/callOutcomes'

interface Props {
  open:               boolean
  onClose:            () => void
  call:               Call | null
  companies:          Company[]
  contacts:           Contact[]
  kams:               Profile[]
  // props opcionales para pre-rellenar desde QuoteDialog
  initialQuoteId?:    string
  initialCompanyId?:  string
  initialContactId?:  string
  initialKamId?:      string
  /** Desde ficha empresa: no permitir cambiar empresa en una interacción nueva */
  lockCompany?:       boolean
  /** Tras guardar una interacción nueva (sin cotización), abrir nueva cotización con esta empresa */
  onAfterSaveGoToNewQuote?: (companyId: string) => void
  onSaved:            () => void
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
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

const getEmpty = (
  kamId     = '',
  companyId = '',
  contactId = '',
): FormState => ({
  type:              'llamada',
  company_id:        companyId,
  contact_id:        contactId,
  kam_id:            kamId,
  called_at:         toLocalDatetime(),
  outcome:           'sin_resultado',
  notes:             '',
  next_contact_date: '',
})

export default function CallDialog({
  open, onClose, call, companies, contacts, kams,
  initialQuoteId, initialCompanyId, initialContactId, initialKamId,
  lockCompany = false,
  onAfterSaveGoToNewQuote,
  onSaved,
}: Props) {
  const { profile } = useAuth()
  const [form,    setForm]    = useState<FormState>(getEmpty())
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Contactos filtrados por empresa seleccionada
  const filteredContacts = contacts.filter(c => c.company_id === form.company_id)

  // Cuando viene de QuoteDialog bloqueamos empresa/contacto/kam
  const isFromQuote = !!initialQuoteId

  const companySelectLocked = isFromQuote || (lockCompany && !call)

  // Seguimiento ligado a cotización: desde QuoteDialog (nueva) o al editar una interacción que ya tiene quote_id
  const quoteContext = isFromQuote || Boolean(call?.quote_id)

  useEffect(() => {
    if (!open) return
    setError(null)

    if (call) {
      // Editar llamada existente
      const offset = new Date().getTimezoneOffset()
      const local  = new Date(new Date(call.called_at).getTime() - offset * 60_000)
      setForm({
        type:              call.type,
        company_id:        call.company_id,
        contact_id:        call.contact_id  ?? '',
        kam_id:            call.kam_id,
        called_at:         local.toISOString().slice(0, 16),
        outcome:           call.outcome,
        notes:             call.notes             ?? '',
        next_contact_date: call.next_contact_date ?? '',
      })
    } else {
      // Nueva llamada — usar valores iniciales si vienen de QuoteDialog
      const kamId     = initialKamId     ?? profile?.id ?? ''
      const companyId = initialCompanyId ?? ''
      const contactId = initialContactId ?? ''
      const base = getEmpty(kamId, companyId, contactId)
      setForm(
        initialQuoteId
          ? {
              ...base,
              outcome: 'requiere_seguimiento',
              next_contact_date: addDaysToTodayIso(7),
            }
          : base,
      )
    }
  }, [open, call, initialQuoteId, initialKamId, initialCompanyId, initialContactId, profile?.id])

  const set = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleCompanyChange = async (companyId: string) => {
    setForm(prev => ({ ...prev, company_id: companyId, contact_id: '' }))

    // Auto-asignar KAM lead si el usuario no es KAM
    if (profile?.role !== 'kam') {
      const { data } = await supabase
        .from('company_kams')
        .select('kam_id')
        .eq('company_id', companyId)
        .eq('is_lead', true)
        .single()
      if (data?.kam_id)
        setForm(prev => ({ ...prev, company_id: companyId, contact_id: '', kam_id: data.kam_id }))
    }
  }

  const persistCall = async (): Promise<boolean> => {
    if (!form.company_id) { setError('Selecciona una empresa'); return false }
    if (!form.kam_id)     { setError('Selecciona un KAM');     return false }

    setLoading(true); setError(null)

    const local = new Date(form.called_at)
    const utc   = new Date(local.getTime() + local.getTimezoneOffset() * 60_000)

    const payload = {
      type:              form.type,
      company_id:        form.company_id,
      contact_id:        form.contact_id        || null,
      kam_id:            form.kam_id,
      called_at:         utc.toISOString(),
      outcome:           form.outcome,
      notes:             form.notes             || null,
      next_contact_date: form.next_contact_date || null,
      quote_id: call ? (call.quote_id ?? null) : (initialQuoteId || null),
    }

    try {
      const result = call
        ? await supabase.from('calls').update(payload).eq('id', call.id).select()
        : await supabase.from('calls').insert(payload).select()

      if (result.error) {
        setError(result.error.message)
        return false
      }
      return true
    } catch {
      setError('Error inesperado')
      return false
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!(await persistCall())) return
    onSaved()
    onClose()
  }

  const handleSaveAndQuote = async () => {
    if (!(await persistCall())) return
    onSaved()
    onAfterSaveGoToNewQuote?.(form.company_id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {call
              ? 'Editar interacción'
              : isFromQuote
              ? 'Registrar interacción de seguimiento'
              : 'Nueva interacción'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">

            {/* Tipo */}
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

            {/* Fecha */}
            <div className="space-y-1">
              <Label>Fecha y hora *</Label>
              <Input
                type="datetime-local"
                value={form.called_at}
                onChange={e => set('called_at', e.target.value)}
              />
            </div>

            {/* Empresa */}
            <div className="col-span-2 space-y-1">
              <Label>Empresa *</Label>
              <Select
                value={form.company_id || '__none__'}
                onValueChange={v => v !== '__none__' && handleCompanyChange(v)}
                disabled={companySelectLocked}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFromQuote && (
                <p className="text-xs text-gray-400">Empresa fijada por la cotización</p>
              )}
              {lockCompany && !call && !isFromQuote && (
                <p className="text-xs text-gray-400">Empresa fijada desde la ficha de la empresa</p>
              )}
            </div>

            {/* Contacto */}
            <div className="col-span-2 space-y-1">
              <Label>Contacto</Label>
              <Select
                value={form.contact_id || '__none__'}
                onValueChange={v => set('contact_id', v === '__none__' ? '' : v)}
                disabled={!form.company_id}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={form.company_id ? 'Selecciona un contacto' : 'Primero selecciona una empresa'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin contacto —</SelectItem>
                  {filteredContacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* KAM */}
            <div className="col-span-2 space-y-1">
              <Label>KAM</Label>
              <Select
                value={form.kam_id || '__none__'}
                onValueChange={v => set('kam_id', v === '__none__' ? '' : v)}
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

            {/* Resultado (etiquetas distintas si el seguimiento es sobre una cotización ya enviada) */}
            <div className="col-span-2 space-y-1">
              <Label>{quoteContext ? 'Resultado del seguimiento a la propuesta *' : 'Resultado *'}</Label>
              <Select value={form.outcome} onValueChange={v => set('outcome', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(quoteContext ? OUTCOMES_QUOTE_FOLLOWUP : OUTCOMES_PROSPECTION).map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Próximo contacto */}
            <div className="col-span-2 space-y-1">
              <Label>Próximo contacto</Label>
              <Input
                type="date"
                value={form.next_contact_date}
                onChange={e => set('next_contact_date', e.target.value)}
              />
            </div>

            {/* Notas */}
            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder={
                  isFromQuote
                    ? '¿Qué se habló? ¿Cuál fue la respuesta del cliente sobre la cotización?'
                    : 'Resumen de la interacción...'
                }
                rows={4}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          {!call && !isFromQuote && form.company_id && onAfterSaveGoToNewQuote && (
            <Button type="button" variant="secondary" onClick={handleSaveAndQuote} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar e ir a cotización'}
            </Button>
          )}
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}