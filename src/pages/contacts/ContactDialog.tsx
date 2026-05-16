import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact, Company } from '@/types'
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

interface Props {
  open: boolean
  onClose: () => void
  contact: Contact | null
  companies: Company[]
  onSaved: () => void
  /** Al crear contacto nuevo, pre-selecciona la empresa (p. ej. desde la ficha empresa) */
  initialCompanyId?: string
}

type FormState = {
  company_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  position: string
  department: string
  is_primary: boolean
  is_active: boolean
  notes: string
}

const empty: FormState = {
  company_id: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  position: '',
  department: '',
  is_primary: false,
  is_active: true,
  notes: '',
}

export default function ContactDialog({ open, onClose, contact, companies, onSaved, initialCompanyId }: Props) {
  const [form, setForm] = useState<FormState>(empty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (contact) {
      setForm({
        company_id: contact.company_id,
        first_name: contact.first_name,
        last_name:  contact.last_name,
        email:      contact.email ?? '',
        phone:      contact.phone ?? '',
        position:   contact.position ?? '',
        department: contact.department ?? '',
        is_primary: contact.is_primary,
        is_active:  contact.is_active,
        notes:      contact.notes ?? '',
      })
    } else {
      setForm({ ...empty, company_id: initialCompanyId ?? '' })
    }
    setError(null)
  }, [contact, open, initialCompanyId])

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.first_name.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.last_name.trim())  { setError('El apellido es obligatorio'); return }
    if (!form.company_id)        { setError('Selecciona una empresa'); return }
    setLoading(true)
    setError(null)

    const payload = {
      company_id: form.company_id,
      first_name: form.first_name.trim(),
      last_name:  form.last_name.trim(),
      email:      form.email || null,
      phone:      form.phone || null,
      position:   form.position || null,
      department: form.department || null,
      is_primary: form.is_primary,
      is_active:  form.is_active,
      notes:      form.notes || null,
    }

    try {
      if (form.is_primary) {
        await supabase
          .from('contacts')
          .update({ is_primary: false })
          .eq('company_id', form.company_id)
          .neq('id', contact?.id ?? '00000000-0000-0000-0000-000000000000')
      }

      const result = contact
        ? await supabase.from('contacts').update(payload).eq('id', contact.id).select()
        : await supabase.from('contacts').insert(payload).select()

      if (result.error) {
        setError(result.error.message)
        setLoading(false)
        return
      }

      const savedContact = result.data?.[0]

      if (form.is_primary && savedContact) {
        await supabase
          .from('companies')
          .update({ primary_contact_id: savedContact.id })
          .eq('id', form.company_id)
      }

      onSaved()
      onClose()
    } catch (e) {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar contacto' : 'Nuevo contacto'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">

            <div className="col-span-2 space-y-1">
              <Label>Empresa *</Label>
              <Select value={form.company_id} onValueChange={v => set('company_id', v)}>
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

            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input
                value={form.first_name}
                onChange={e => set('first_name', e.target.value)}
                placeholder="Juan"
                autoComplete="off"
                name="contact-first-name"
              />
            </div>

            <div className="space-y-1">
              <Label>Apellido *</Label>
              <Input
                value={form.last_name}
                onChange={e => set('last_name', e.target.value)}
                placeholder="Pérez"
                autoComplete="off"
                name="contact-last-name"
              />
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="juan@empresa.com"
                autoComplete="off"
                name="contact-email"
              />
            </div>

            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+56 9 1234 5678"
                autoComplete="off"
                name="contact-phone"
              />
            </div>

            <div className="space-y-1">
              <Label>Cargo</Label>
              <Input
                value={form.position}
                onChange={e => set('position', e.target.value)}
                placeholder="Gerente Comercial"
                autoComplete="off"
                name="contact-position"
              />
            </div>

            <div className="space-y-1">
              <Label>Departamento</Label>
              <Input
                value={form.department}
                onChange={e => set('department', e.target.value)}
                placeholder="Ventas"
                autoComplete="off"
                name="contact-department"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder={!form.is_active ? 'Ej: Se cambió de trabajo en marzo 2025...' : 'Notas adicionales...'}
                rows={3}
              />
            </div>

            <div className="col-span-2 flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_primary"
                  checked={form.is_primary}
                  onChange={e => set('is_primary', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is_primary" className="cursor-pointer">
                  Contacto principal de la empresa
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={e => set('is_active', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Contacto activo
                </Label>
              </div>
            </div>

          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}