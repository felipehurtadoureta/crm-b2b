import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Call, Company, Contact, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Phone, Mail, MessageCircle, Users, MapPin, FileText } from 'lucide-react'
import CallDialog from './CallDialog'

interface CallWithRelations extends Call {
  company:  { name: string }
  contact:  { first_name: string; last_name: string } | null
  kam:      { id: string; full_name: string }
  quote?:   { id: string; quote_number: string; title?: string } | null
}

export default function CallsPage() {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [calls, setCalls]         = useState<CallWithRelations[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts]   = useState<Contact[]>([])
  const [kams, setKams]           = useState<Profile[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected]   = useState<Call | null>(null)

  const canEdit = (kamId: string) =>
    profile?.role === 'super_admin' || (profile?.role === 'kam' && kamId === profile?.id)

  const fetchCalls = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('calls')
      .select(`
        *,
        company:companies(name),
        contact:contacts(first_name, last_name),
        kam:profiles(id, full_name),
        quote:quotes!quote_id(id, quote_number, title)
      `)
      .order('called_at', { ascending: false })
    if (error) console.error('fetchCalls error:', error)
    setCalls((data ?? []) as CallWithRelations[])
    setLoading(false)
  }, [])

  const fetchRelated = useCallback(async () => {
    const [{ data: co }, { data: ct }, { data: k }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('contacts').select('*').eq('is_active', true).order('first_name'),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    ])
    setCompanies(co ?? [])
    setContacts(ct ?? [])
    setKams(k ?? [])
  }, [])

  useEffect(() => { fetchCalls(); fetchRelated() }, [fetchCalls, fetchRelated])

  const filtered = calls.filter(c => {
    const term = search.toLowerCase()
    return (
      c.company?.name.toLowerCase().includes(term) ||
      `${c.contact?.first_name ?? ''} ${c.contact?.last_name ?? ''}`.toLowerCase().includes(term) ||
      c.kam?.full_name.toLowerCase().includes(term) ||
      (c.quote?.title ?? c.quote?.quote_number ?? '').toLowerCase().includes(term)
    )
  })

  // Navegar a /quotes y resaltar la cotización vinculada
  const goToQuote = (quoteId: string) => {
    navigate('/quotes', { state: { highlightId: quoteId } })
  }

  const typeIcon: Record<string, React.ReactElement> = {
    llamada:  <Phone size={14} className="text-blue-500" />,
    whatsapp: <MessageCircle size={14} className="text-green-500" />,
    email:    <Mail size={14} className="text-orange-500" />,
    reunion:  <Users size={14} className="text-purple-500" />,
    visita:   <MapPin size={14} className="text-red-500" />,
  }
  const typeLabel: Record<string, string> = {
    llamada: 'Llamada', whatsapp: 'WhatsApp', email: 'Email', reunion: 'Reunión', visita: 'Visita',
  }
  const outcomeLabel: Record<string, { label: string; color: string }> = {
    sin_resultado:         { label: 'Sin resultado',        color: 'bg-gray-100 text-gray-600' },
    interesado:            { label: 'Interesado',           color: 'bg-green-100 text-green-700' },
    no_interesado:         { label: 'No interesado',        color: 'bg-red-100 text-red-700' },
    requiere_seguimiento:  { label: 'Requiere seguimiento', color: 'bg-yellow-100 text-yellow-700' },
    cotizacion_solicitada: { label: 'Cotiz. solicitada',    color: 'bg-blue-100 text-blue-700' },
    venta_cerrada:         { label: 'Venta cerrada',        color: 'bg-purple-100 text-purple-700' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Interacciones</h2>
          <p className="text-gray-500 mt-1">{calls.length} interacciones registradas</p>
        </div>
        {profile?.role !== 'reader' && (
          <Button onClick={() => { setSelected(null); setDialogOpen(true) }} className="flex items-center gap-2">
            <Plus size={16} /> Nueva interacción
          </Button>
        )}
      </div>

      <div className="relative w-full max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar empresa, contacto, KAM o cotización..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9" autoComplete="new-password"
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cotización</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Próx. contacto</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <Phone size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">No hay interacciones registradas</p>
                </td>
              </tr>
            ) : filtered.map(call => {
              const outcome     = outcomeLabel[call.outcome]
              const localDate   = new Date(call.called_at).toLocaleDateString('es-CL')
              const userCanEdit = canEdit(call.kam?.id ?? '')

              return (
                <tr key={call.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{localDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {typeIcon[call.type]}
                      <span className="text-gray-700">{typeLabel[call.type]}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{call.company?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {call.contact ? `${call.contact.first_name} ${call.contact.last_name}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{call.kam?.full_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${outcome.color}`}>
                      {outcome.label}
                    </span>
                  </td>

                  {/* Cotización vinculada — solo muestra si existe */}
                  <td className="px-4 py-3">
                    {call.quote ? (
                      <button
                        onClick={() => goToQuote(call.quote!.id)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        title="Ver cotización"
                      >
                        <FileText size={12} />
                        <span className="font-mono">{call.quote.quote_number}</span>
                        {call.quote.title && (
                          <span className="text-gray-400 truncate max-w-[80px]">· {call.quote.title}</span>
                        )}
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-gray-600">
                    {call.next_contact_date
                      ? new Date(call.next_contact_date + 'T00:00:00').toLocaleDateString('es-CL')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {userCanEdit ? (
                      <Button variant="ghost" size="sm" onClick={() => { setSelected(call); setDialogOpen(true) }}>
                        Editar
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled className="text-gray-300">Editar</Button>
                    )}
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