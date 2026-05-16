// src/pages/quotes/QuoteCallDialog.tsx
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { addDaysToTodayIso, OUTCOMES_QUOTE_FOLLOWUP } from '@/lib/callOutcomes'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Props {
  open:       boolean
  onClose:    () => void
  quoteId:    string
  companyId:  string
  contactId?: string | null
  onSaved:    () => void
}

const toLocalDatetime = () => {
  const now    = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

export default function QuoteCallDialog({
  open, onClose, quoteId, companyId, contactId, onSaved,
}: Props) {
  const { profile } = useAuth()
  const [type,            setType]            = useState('llamada')
  const [calledAt,        setCalledAt]        = useState(toLocalDatetime())
  const [outcome,         setOutcome]         = useState('requiere_seguimiento')
  const [notes,           setNotes]           = useState('')
  const [nextContactDate, setNextContactDate] = useState('')
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  useEffect(() => {
    if (!open) return
    setType('llamada')
    setCalledAt(toLocalDatetime())
    setOutcome('requiere_seguimiento')
    setNotes('')
    setNextContactDate(addDaysToTodayIso(7))
    setError('')
  }, [open])

  async function handleSave() {
    setSaving(true); setError('')
    const local = new Date(calledAt)
    const utc   = new Date(local.getTime() + local.getTimezoneOffset() * 60_000)

    const { error: err } = await supabase.from('calls').insert({
      type,
      company_id:        companyId,
      contact_id:        contactId || null,
      kam_id:            profile?.id,
      quote_id:          quoteId,
      called_at:         utc.toISOString(),
      outcome,
      notes:             notes || null,
      next_contact_date: nextContactDate || null,
    })

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col">

        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Seguimiento a la cotización</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Indique qué respondió el cliente respecto a la propuesta enviada. El resultado y la próxima fecha
            quedan en el historial de la cotización y en la agenda como seguimiento a esa cotización.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Medio</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="reunion">Reunión</SelectItem>
                  <SelectItem value="visita">Visita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={calledAt}
                onChange={e => setCalledAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Resultado del seguimiento *</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES_QUOTE_FOLLOWUP.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Próximo contacto con el cliente *</Label>
            <Input
              type="date"
              value={nextContactDate}
              onChange={e => setNextContactDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="¿Qué dijo el cliente sobre la propuesta, precio o plazos?"
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving || !nextContactDate.trim()}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
