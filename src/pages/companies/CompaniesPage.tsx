import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company, Profile } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Building2 } from 'lucide-react'
import CompanyDialog from './CompanyDialog'

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [kams, setKams] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('*')
      .order('name')
    setCompanies(data ?? [])
    setLoading(false)
  }, [])

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
    fetchCompanies()
    fetchKams()
  }, [fetchCompanies, fetchKams])

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.rut?.toLowerCase().includes(search.toLowerCase()) ||
    c.city?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor: Record<string, string> = {
    activo:    'bg-green-100 text-green-700',
    inactivo:  'bg-gray-100 text-gray-600',
    potencial: 'bg-blue-100 text-blue-700',
  }

  const openCreate = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (c: Company) => { setSelected(c); setDialogOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Empresas</h2>
          <p className="text-gray-500 mt-1">{companies.length} empresas registradas</p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={16} /> Nueva empresa
        </Button>
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <Building2 size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">No hay empresas</p>
                </td>
              </tr>
            ) : filtered.map(company => (
              <tr key={company.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{company.name}</p>
                  {company.website && (
                    <a href={company.website} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline">{company.website}</a>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{company.rut ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{company.city ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{company.industry ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[company.status]}`}>
                    {company.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(company)}>
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