import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact, Company } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Users, Star } from 'lucide-react'
import ContactDialog from './ContactDialog'

interface ContactWithCompany extends Contact {
  company: { name: string }
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactWithCompany[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'activo' | 'inactivo' | 'todos'>('activo')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Contact | null>(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('contacts')
      .select(`*, company:companies!contacts_company_id_fkey(name)`)
      .order('first_name')
    setContacts(data ?? [])
    setLoading(false)
  }, [])

  const fetchCompanies = useCallback(async () => {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('name')
    setCompanies(data ?? [])
  }, [])

  useEffect(() => {
    fetchContacts()
    fetchCompanies()
  }, [fetchContacts, fetchCompanies])

  const handleSaved = useCallback(() => {
    fetchContacts()
  }, [fetchContacts])

  const filtered = contacts.filter(c => {
    const matchSearch =
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.name.toLowerCase().includes(search.toLowerCase())

    const matchActive =
      filterActive === 'todos' ? true :
      filterActive === 'activo' ? c.is_active :
      !c.is_active

    return matchSearch && matchActive
  })

  const openCreate = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (c: Contact) => { setSelected(c); setDialogOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Contactos</h2>
          <p className="text-gray-500 mt-1">{filtered.length} contactos</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={16} /> Nuevo contacto
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por nombre, email o empresa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            autoComplete="new-password"
          />
        </div>

        <div className="flex rounded-lg border overflow-hidden text-sm">
          {(['activo', 'inactivo', 'todos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                filterActive === f
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'activo' ? 'Activos' : f === 'inactivo' ? 'Inactivos' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cargo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <Users size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">No hay contactos</p>
                </td>
              </tr>
            ) : filtered.map(contact => (
              <tr key={contact.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {contact.first_name} {contact.last_name}
                    </p>
                    {contact.is_primary && (
                      <Star size={13} className="text-yellow-400 fill-yellow-400" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{contact.company?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{contact.position ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{contact.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{contact.phone ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    contact.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {contact.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(contact)}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ContactDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        contact={selected}
        companies={companies}
        onSaved={handleSaved}
      />
    </div>
  )
}