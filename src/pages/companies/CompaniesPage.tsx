import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { kamAbbrOrInitials } from '@/lib/kamDisplay'
import type { Company, Profile } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Building2 } from 'lucide-react'
import CompanyDialog from './CompanyDialog'

type CompanyFilter = 'mine' | 'all'

export default function CompaniesPage() {
  const navigate = useNavigate()
  const { profile, loading: authLoading } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [kams, setKams] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)
  /** KAM: por defecto solo sus empresas; puede ampliar a todas */
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>('mine')
  /** KAM principal por empresa: texto corto + nombre completo para tooltip */
  const [leadKamByCompany, setLeadKamByCompany] = useState<Record<string, { label: string; title: string }>>({})

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'kam') setCompanyFilter('all')
  }, [profile?.role, profile?.id])

  const fetchCompanies = useCallback(async () => {
    if (authLoading || !profile) {
      setCompanies([])
      setLoading(false)
      return
    }

    setLoading(true)

    if (profile.role === 'kam' && companyFilter === 'mine') {
      const { data: links, error: lErr } = await supabase
        .from('company_kams')
        .select('company_id')
        .eq('kam_id', profile.id)

      if (lErr) {
        console.error(lErr)
        setCompanies([])
        setLoading(false)
        return
      }

      const ids = [...new Set((links ?? []).map(l => l.company_id))]
      if (ids.length === 0) {
        setCompanies([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase.from('companies').select('*').in('id', ids).order('name')
      if (error) {
        console.error(error)
        setCompanies([])
      } else {
        setCompanies(data ?? [])
      }
    } else {
      const { data, error } = await supabase.from('companies').select('*').order('name')
      if (error) {
        console.error(error)
        setCompanies([])
      } else {
        setCompanies(data ?? [])
      }
    }

    setLoading(false)
  }, [authLoading, profile, companyFilter])

  const fetchKams = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['kam', 'super_admin'])
      .eq('is_active', true)
      .order('full_name')
    setKams(data ?? [])
  }, [])

  useEffect(() => {
    void fetchKams()
  }, [fetchKams])

  useEffect(() => {
    void fetchCompanies()
  }, [fetchCompanies])

  useEffect(() => {
    if (companies.length === 0) {
      setLeadKamByCompany({})
      return
    }
    let cancelled = false
    const ids = companies.map(c => c.id)
    void (async () => {
      const { data, error } = await supabase
        .from('company_kams')
        .select('company_id, is_lead, kam:profiles(full_name, display_abbr)')
        .in('company_id', ids)
      if (cancelled) return
      if (error) {
        console.error(error)
        setLeadKamByCompany({})
        return
      }
      type Row = { company_id: string; is_lead: boolean; kam: unknown }
      const byCompany = new Map<string, Row[]>()
      for (const raw of (data ?? []) as Row[]) {
        const list = byCompany.get(raw.company_id) ?? []
        list.push(raw)
        byCompany.set(raw.company_id, list)
      }
      const next: Record<string, { label: string; title: string }> = {}
      for (const id of ids) {
        const rows = byCompany.get(id) ?? []
        const pick = rows.find(r => r.is_lead) ?? rows[0]
        if (!pick?.kam) continue
        const kObj = Array.isArray(pick.kam) ? pick.kam[0] : pick.kam
        if (!kObj || typeof kObj !== 'object' || !('full_name' in kObj)) continue
        const k = kObj as { full_name: string; display_abbr?: string | null }
        next[id] = { label: kamAbbrOrInitials(k), title: k.full_name }
      }
      setLeadKamByCompany(next)
    })()
    return () => {
      cancelled = true
    }
  }, [companies])

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.rut?.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase()),
  )

  const statusColor: Record<string, string> = {
    activo:    'bg-green-100 text-green-700',
    inactivo:  'bg-gray-100 text-gray-600',
    potencial: 'bg-blue-100 text-blue-700',
  }

  const openCreate = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (c: Company) => { setSelected(c); setDialogOpen(true) }

  const listSubtitle = () => {
    if (authLoading || !profile) return 'Cargando…'
    if (profile.role === 'kam' && companyFilter === 'mine') {
      return `${companies.length} empresas asignadas a ti`
    }
    return `${companies.length} empresas registradas`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Empresas</h2>
          <p className="text-gray-500 mt-1">{listSubtitle()}</p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {profile?.role === 'kam' && (
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm shadow-sm">
              <button
                type="button"
                onClick={() => setCompanyFilter('mine')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  companyFilter === 'mine'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Mis empresas
              </button>
              <button
                type="button"
                onClick={() => setCompanyFilter('all')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  companyFilter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                Todas las empresas
              </button>
            </div>
          )}
          <Button onClick={openCreate} className="flex items-center justify-center gap-2 shrink-0">
            <Plus size={16} /> Nueva empresa
          </Button>
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar por nombre, RUT o ciudad..."
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">RUT</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ciudad</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Industria</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">KAM</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading || authLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <Building2 size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">
                    {profile?.role === 'kam' && companyFilter === 'mine'
                      ? 'No tienes empresas asignadas. Prueba «Todas las empresas» o pide asignación al administrador.'
                      : 'No hay empresas'}
                  </p>
                </td>
              </tr>
            ) : filtered.map(company => (
              <tr
                key={company.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/companies/${company.id}/v2`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/companies/${company.id}/v2`) } }}
                className="border-b last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{company.name}</p>
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      {company.website}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{company.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{company.city ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{company.industry ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700 font-medium" title={leadKamByCompany[company.id]?.title}>
                  {leadKamByCompany[company.id]?.label ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[company.status]}`}>
                    {company.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={e => { e.stopPropagation(); openEdit(company) }}
                  >
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CompanyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        company={selected}
        kams={kams}
        onSaved={fetchCompanies}
      />
    </div>
  )
}
