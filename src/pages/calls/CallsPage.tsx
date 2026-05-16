// src/pages/calls/CallsPage.tsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Call, Company, Contact, Profile } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Phone, Mail, MessageCircle, Users, MapPin } from 'lucide-react'
import CallDialog from './CallDialog'

interface CallWithRelations extends Call {
  company: { name: string }
  contact: { first_name: string; last_name: string } | null
  kam: { full_name: string }
}

export default function CallsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const pendingOpenCallId = useRef<string | null>(null)

  const [calls, setCalls]       = useState<CallWithRelations[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [kams, setKams]           = useState<Profile[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected]   = useState<Call | null>(null)

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('calls')
      .select(`
        *,
        company:companies(name),
        contact:contacts(first_name, last_name),
        kam:profiles(full_name)
      `)
      .is('quote_id', null)
      .order('called_at', { ascending: false })
    setCalls(data ?? [])
    setLoading(false)
  }, [])

  const fetchRelated = useCallback(async () => {
    const [{ data: companiesData }, { data: contactsData }, { data: kamsData }] =
      await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('contacts').select('*').eq('is_active', true).order('first_name'),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ])
    setCompanies(companiesData ?? [])
    setContacts(contactsData ?? [])
    setKams(kamsData ?? [])
  }, [])

  useEffect(() => {
    fetchCalls()
    fetchRelated()
  }, [fetchCalls, fetchRelated])

  // Abrir detalle desde /agenda u otras pantallas (state.openCallId)
  useEffect(() => {
    const s = location.state as { openCallId?: string } | null
    if (s?.openCallId) {
      pendingOpenCallId.current = s.openCallId
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (loading) return
    const id = pendingOpenCallId.current
    if (!id) return

    const run = async () => {
      let c = calls.find(x => x.id === id)
      if (!c) {
        const { data } = await supabase
          .from('calls')
          .select(`
            *,
            company:companies(name),
            contact:contacts(first_name, last_name),
            kam:profiles(full_name)
          `)
          .eq('id', id)
          .maybeSingle()
        if (data) c = data as CallWithRelations
      }
      pendingOpenCallId.current = null
      if (c) {
        setSelected(c)
        setDialogOpen(true)
      }
    }
    void run()
  }, [loading, calls])

  const filtered = calls.filter(c =>
    c.company?.name.toLowerCase().includes(search.toLowerCase()) ||
    `${c.contact?.first_name ?? ''} ${c.contact?.last_name ?? ''}`.toLowerCase().includes(search.toLowerCase()) ||
    c.kam?.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const typeIcon: Record<string, React.ReactElement> = {
    llamada:  <Phone size={14} className="text-blue-500" />,
    whatsapp: <MessageCircle size={14} className="text-green-500" />,
    email:    <Mail size={14} className="text-orange-500" />,
    reunion:  <Users size={14} className="text-purple-500" />,
    visita:   <MapPin size={14} className="text-red-500" />,
  }

  const typeLabel: Record<string, string> = {
    llamada: 'Llamada', whatsapp: 'WhatsApp',
    email: 'Email', reunion: 'Reunión', visita: 'Visita',
  }

  const outcomeLabel: Record<string, { label: string; color: string }> = {
    sin_resultado:         { label: 'Sin resultado',         color: 'bg-gray-100 text-gray-600' },
    interesado:            { label: 'Interesado',            color: 'bg-green-100 text-green-700' },
    no_interesado:         { label: 'No interesado',         color: 'bg-red-100 text-red-700' },
    requiere_seguimiento:  { label: 'Requiere seguimiento',  color: 'bg-yellow-100 text-yellow-700' },
    cotizacion_solicitada: { label: 'Cotización solicitada', color: 'bg-blue-100 text-blue-700' },
    venta_cerrada:         { label: 'Venta cerrada',         color: 'bg-purple-100 text-purple-700' },
  }

  const openCreate = () => { setSelected(null); setDialogOpen(true) }
  const openEdit   = (c: Call) => { setSelected(c); setDialogOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Interacciones</h2>
          <p className="text-gray-500 mt-1">
            {calls.length} registros sin cotización vinculada (vista de prospección)
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={16} /> Nueva interacción
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar por empresa o contacto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          autoComplete="new-password"
        />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">KAM</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Resultado</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Próx. contacto</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">Cargando...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <Phone size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">No hay interacciones de prospección</p>
                </td>
              </tr>
            ) : filtered.map(call => {
              const outcome   = outcomeLabel[call.outcome]
              const localDate = new Date(call.called_at).toLocaleDateString('es-CL')
              return (
                <tr key={call.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600">{localDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {typeIcon[call.type]}
                      <span className="text-gray-700">{typeLabel[call.type]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{call.company?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {call.contact
                      ? `${call.contact.first_name} ${call.contact.last_name}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{call.kam?.full_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${outcome.color}`}>
                      {outcome.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {call.next_contact_date
                      ? new Date(call.next_contact_date + 'T00:00:00').toLocaleDateString('es-CL')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(call)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <CallDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        call={selected}
        companies={companies}
        contacts={contacts}
        kams={kams}
        onSaved={fetchCalls}
      />
    </div>
  )
}