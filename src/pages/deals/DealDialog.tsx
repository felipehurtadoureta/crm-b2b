import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Deal, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { FileText, Plus, ExternalLink } from 'lucide-react'

type Stage    = Deal['stage']
type Currency = Deal['currency']

const NO_CONTACT = '__none__'

const STAGES: { value: Stage; label: string }[] = [
  { value: 'nuevo',             label: 'Nuevo' },
  { value: 'en_negociacion',    label: 'En negociación' },
  { value: 'propuesta_enviada', label: 'Propuesta enviada' },
  { value: 'ganado',            label: 'Ganado' },
  { value: 'perdido',           label: 'Perdido' },
]

const QUOTE_STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada',
  aceptada: 'Aceptada', rechazada: 'Rechazada',
}
const QUOTE_STATUS_COLORS: Record<string, string> = {
  borrador:  'bg-gray-100 text-gray-600',
  enviada:   'bg-blue-100 text-blue-700',
  aceptada:  'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-600',
}

interface QuoteSummary {
  id:           string
  quote_number: string
  status:       string
  currency:     string
  total:        number
  created_at:   string
}

interface Props {
  open:    boolean
  onClose: () => void
  deal:    Deal | null
  onSaved: () => void
}

interface Form {
  title:          string
  company_id:     string
  contact_id:     string
  kam_id:         string
  stage:          Stage
  probability:    number
  expected_value: string
  currency:       Currency
  expected_close: string
  description:    string
  lost_reason:    string
}

const EMPTY: Form = {
  title: '', company_id: '', contact_id: NO_CONTACT, kam_id: '',
  stage: 'nuevo', probability: 20, expected_value: '',
  currency: 'CLP', expected_close: '', description: '', lost_reason: '',
}

const fmtCurrency = (amount: number, currency: string): string => {
  if (currency === 'CLP')
    return new Intl.NumberFormat('es-CL', {
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
    }).format(amount)
  if (currency === 'USD')
    return `US$ ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount)}`
  return `UF ${new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(amount)}`
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

export default function DealDialog({ open, onClose, deal, onSaved }: Props) {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [form, setForm]           = useState<Form>(EMPTY)
  const [companies, setCompanies] = useState<Pick<Company, 'id' | 'name'>[]>([])
  const [contacts, setContacts]   = useState<Pick<Contact, 'id' | 'first_name' | 'last_name'>[]>([])
  const [kams, setKams]           = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [quotes, setQuotes]       = useState<QuoteSummary[]>([])
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState('')

  /* ── combos ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    supabase.from('companies').select('id,name').eq('status', 'activo').order('name')
      .then(({ data }) => setCompanies(data ?? []))
    supabase.from('profiles').select('id,full_name').eq('is_active', true)
      .then(({ data }) => setKams(data ?? []))
  }, [open])

  /* ── contactos por empresa ─────────────────────────────────────── */
  useEffect(() => {
    if (!form.company_id) { setContacts([]); return }
    supabase.from('contacts').select('id,first_name,last_name')
      .eq('company_id', form.company_id).eq('is_active', true).order('first_name')
      .then(({ data }) => setContacts(data ?? []))
  }, [form.company_id])

  /* ── cotizaciones vinculadas ───────────────────────────────────── */
  useEffect(() => {
    if (!open || !deal) { setQuotes([]); return }
    supabase
      .from('quotes')
      .select('id, quote_number, status, currency, total, created_at')
      .eq('deal_id', deal.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setQuotes(data ?? []))
  }, [open, deal?.id])

  /* ── form ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    setError('')
    if (deal) {
      setForm({
        title:          deal.title,
        company_id:     deal.company_id,
        contact_id:     deal.contact_id ?? NO_CONTACT,
        kam_id:         deal.kam_id,
        stage:          deal.stage,
        probability:    deal.probability,
        expected_value: deal.expected_value?.toString() ?? '',
        currency:       deal.currency,
        expected_close: deal.expected_close ?? '',
        description:    deal.description   ?? '',
        lost_reason:    deal.lost_reason   ?? '',
      })
    } else {
      setForm({ ...EMPTY, kam_id: profile?.id ?? '' })
    }
  }, [open]) // eslint-disable-line

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  /* ── guardar ───────────────────────────────────────────────────── */
  async function handleSave() {
    if (!form.title.trim()) { setError('El título es obligatorio'); return }
    if (!form.company_id)   { setError('Selecciona una empresa'); return }
    if (!form.kam_id)       { setError('Selecciona un KAM'); return }
    setSaving(true); setError('')

    const contactId = form.contact_id === NO_CONTACT ? undefined : form.contact_id

    const payload: Partial<Deal> = {
      title:          form.title.trim(),
      company_id:     form.company_id,
      contact_id:     contactId,
      kam_id:         form.kam_id,
      stage:          form.stage,
      probability:    form.probability,
      expected_value: form.expected_value ? parseFloat(form.expected_value) : undefined,
      currency:       form.currency,
      expected_close: form.expected_close || undefined,
      description:    form.description.trim() || undefined,
      lost_reason:    form.stage === 'perdido' ? form.lost_reason.trim() || undefined : undefined,
      closed_at:      ['ganado', 'perdido'].includes(form.stage)
        ? (deal?.closed_at ?? new Date().toISOString()) : undefined,
    }

    const { error: err } = deal
      ? await supabase.from('deals').update(payload).eq('id', deal.id)
      : await supabase.from('deals').insert([payload])

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  /* ── eliminar ──────────────────────────────────────────────────── */
  async function handleDelete() {
    if (!deal) return
    if (!confirm('¿Eliminar este negocio?')) return
    setDeleting(true)
    await supabase.from('deals').delete().eq('id', deal.id)
    setDeleting(false)
    onSaved(); onClose()
  }

  /* ── nueva cotización desde este deal ──────────────────────────── */
  function handleNewQuote() {
    onClose()
    navigate('/quotes', {
      state: {
        openNew:   true,
        dealId:    deal?.id,
        companyId: form.company_id,
      },
    })
  }

  const readonly = profile?.role === 'reader'

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {deal ? 'Editar negocio' : 'Nuevo negocio'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          <div className="space-y-1">
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Nombre del negocio"
              disabled={readonly}
            />
          </div>

          <div className="space-y-1">
            <Label>Empresa *</Label>
            <Select
              value={form.company_id || '__none__'}
              onValueChange={v => {
                if (v !== '__none__') { set('company_id', v); set('contact_id', NO_CONTACT) }
              }}
              disabled={readonly}
            >
              <SelectTrigger><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Contacto</Label>
            <Select
              value={form.contact_id}
              onValueChange={v => set('contact_id', v)}
              disabled={readonly || !form.company_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={form.company_id ? 'Seleccionar contacto (opcional)' : 'Primero elige empresa'} />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value={NO_CONTACT}>Sin contacto</SelectItem>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {profile?.role === 'super_admin' && (
            <div className="space-y-1">
              <Label>KAM *</Label>
              <Select value={form.kam_id || '__none__'} onValueChange={v => set('kam_id', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar KAM" /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {kams.map(k => (
                    <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Etapa</Label>
              <Select
                value={form.stage}
                onValueChange={v => set('stage', v as Stage)}
                disabled={readonly}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Probabilidad (%)</Label>
              <Input
                type="number" min={0} max={100}
                value={form.probability}
                onChange={e => set('probability', parseInt(e.target.value) || 0)}
                disabled={readonly}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor esperado</Label>
              <Input
                type="number" min={0}
                value={form.expected_value}
                onChange={e => set('expected_value', e.target.value)}
                placeholder="0"
                disabled={readonly}
              />
            </div>
            <div className="space-y-1">
              <Label>Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={v => set('currency', v as Currency)}
                disabled={readonly}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">CLP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Cierre estimado</Label>
            <Input
              type="date"
              value={form.expected_close}
              onChange={e => set('expected_close', e.target.value)}
              disabled={readonly}
            />
          </div>

          {form.stage === 'perdido' && (
            <div className="space-y-1">
              <Label>Motivo de pérdida</Label>
              <Input
                value={form.lost_reason}
                onChange={e => set('lost_reason', e.target.value)}
                placeholder="¿Por qué se perdió?"
                disabled={readonly}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Descripción</Label>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Detalles del negocio..."
              rows={3}
              disabled={readonly}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* ── Cotizaciones vinculadas ─────────────────────────────── */}
          {deal && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-900">Cotizaciones</span>
                    {quotes.length > 0 && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {quotes.length}
                      </span>
                    )}
                  </div>
                  {!readonly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={handleNewQuote}
                    >
                      <Plus size={12} /> Nueva cotización
                    </Button>
                  )}
                </div>

                {quotes.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-100 py-5 text-center text-xs text-gray-400">
                    Sin cotizaciones vinculadas a este negocio
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">N°</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Total</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Fecha</th>
                          <th className="w-6" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {quotes.map(q => (
                          <tr key={q.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono font-medium text-gray-900">
                              {q.quote_number}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_COLORS[q.status]}`}>
                                {QUOTE_STATUS_LABELS[q.status]}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800">
                              {fmtCurrency(q.total, q.currency)}
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {fmtDate(q.created_at)}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose()
                                  navigate('/quotes', { state: { highlightId: q.id } })
                                }}
                                className="text-gray-300 hover:text-gray-600 transition-colors"
                                title="Ver en cotizaciones"
                              >
                                <ExternalLink size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center gap-2 shrink-0">
          {deal && profile?.role === 'super_admin' && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="mr-auto"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          {!readonly && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : deal ? 'Guardar cambios' : 'Crear negocio'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}