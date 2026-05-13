import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

interface Props {
  open: boolean
  onClose: () => void
  company: Company | null
  kams: Profile[]
  onSaved: () => void
}

type FormState = {
  name: string; rut: string; industry: string; website: string
  address: string; city: string; country: string; phone: string
  status: 'activo' | 'inactivo' | 'potencial'; notes: string; lead_kam_id: string
}

const empty: FormState = {
  name: '', rut: '', industry: '', website: '',
  address: '', city: '', country: 'Chile',
  phone: '', status: 'activo', notes: '', lead_kam_id: ''
}

export default function CompanyDialog({ open, onClose, company, kams, onSaved }: Props) {
  const { profile } = useAuth()
  const [form, setForm] = useState<FormState>(empty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const loadData = async () => {
      if (company) {
        const { data: kamData } = await supabase
          .from('company_kams').select('kam_id')
          .eq('company_id', company.id).eq('is_lead', true).single()
        setForm({
          name: company.name, rut: company.rut ?? '',
          industry: company.industry ?? '', website: company.website ?? '',
          address: company.address ?? '', city: company.city ?? '',
          country: company.country, phone: company.phone ?? '',
          status: company.status, notes: company.notes ?? '',
          lead_kam_id: kamData?.kam_id ?? '',
        })
      } else {
        setForm({ ...empty, lead_kam_id: profile?.role === 'kam' ? profile.id : '' })
      }
      setError(null)
    }
    loadData()
  }, [open, company?.id]) // eslint-disable-line

  const set = (field: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setLoading(true); setError(null)

    const payload = {
      name: form.name.trim(), rut: form.rut || null,
      industry: form.industry || null, website: form.website || null,
      address: form.address || null, city: form.city || null,
      country: form.country, phone: form.phone || null,
      status: form.status, notes: form.notes || null,
    }

    try {
      let companyId = company?.id
      if (company) {
        const { error } = await supabase.from('companies').update(payload).eq('id', company.id)
        if (error) { setError(error.message); setLoading(false); return }
      } else {
        const { data, error } = await supabase.from('companies').insert(payload).select().single()
        if (error) { setError(error.message); setLoading(false); return }
        companyId = data.id
      }

      if (companyId && form.lead_kam_id) {
        await supabase.from('company_kams').update({ is_lead: false }).eq('company_id', companyId)
        await supabase.from('company_kams').upsert({
          company_id: companyId, kam_id: form.lead_kam_id, is_lead: true,
        }, { onConflict: 'company_id,kam_id' })
      }

      onSaved(); onClose()
    } catch {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '90vh' }}>

        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {company ? 'Editar empresa' : 'Nueva empresa'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-4">

            <div className="col-span-2 space-y-1">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Empresa S.A." autoComplete="off" />
            </div>

            <div className="space-y-1">
              <Label>RUT</Label>
              <Input value={form.rut} onChange={e => set('rut', e.target.value)}
                placeholder="12.345.678-9" autoComplete="off" />
            </div>

            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+56 9 1234 5678" autoComplete="off" />
            </div>

            <div className="space-y-1">
              <Label>Industria</Label>
              <Input value={form.industry} onChange={e => set('industry', e.target.value)}
                placeholder="Tecnología" autoComplete="off" />
            </div>

            <div className="space-y-1">
              <Label>Sitio web</Label>
              <Input value={form.website} onChange={e => set('website', e.target.value)}
                placeholder="https://..." autoComplete="off" />
            </div>

            <div className="space-y-1">
              <Label>Ciudad</Label>
              <Input value={form.city} onChange={e => set('city', e.target.value)}
                placeholder="Santiago" autoComplete="off" />
            </div>

            <div className="space-y-1">
              <Label>País</Label>
              <Input value={form.country} onChange={e => set('country', e.target.value)}
                placeholder="Chile" autoComplete="off" />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Dirección</Label>
              <Input value={form.address} onChange={e => set('address', e.target.value)}
                placeholder="Av. Ejemplo 123" autoComplete="off" />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>KAM responsable</Label>
              <Select value={form.lead_kam_id || '__none__'}
                onValueChange={v => set('lead_kam_id', v === '__none__' ? '' : v)}
                disabled={profile?.role === 'kam'}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un KAM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sin KAM —</SelectItem>
                  {kams.map(k => <SelectItem key={k.id} value={k.id}>{k.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              {profile?.role === 'kam' && (
                <p className="text-xs text-gray-400">Asignado automáticamente a tu usuario</p>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={v => set('status', v as FormState['status'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                  <SelectItem value="potencial">Potencial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Notas adicionales..." rows={3} />
            </div>

          </div>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
