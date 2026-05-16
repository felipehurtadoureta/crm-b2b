/**
 * Buscador de empresas para filtrar la agenda por `?company=id`.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface AgendaCompanySearchProps {
  filteredCompanyId: string | null
  /** Nombre legible de la empresa filtrada (si ya se conoce). */
  filteredCompanyName: string | null
  onChooseCompany: (id: string) => void
  onClearFilter: () => void
}

export default function AgendaCompanySearch({
  filteredCompanyId,
  filteredCompanyName,
  onChooseCompany,
  onClearFilter,
}: AgendaCompanySearchProps) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [abierto, setAbierto] = useState(false)
  const envoltorioRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 320)
    return () => clearTimeout(t)
  }, [q])

  const { data: opciones = [], isFetching } = useQuery({
    queryKey: ['agenda-company-picker', debounced],
    queryFn: async () => {
      const term = debounced.replace(/%/g, '').trim()
      if (term.length === 1) return [] as { id: string; name: string }[]
      let rq = supabase.from('companies').select('id, name').order('name', { ascending: true }).limit(40)
      if (term.length >= 2) rq = rq.ilike('name', `%${term}%`)
      const { data, error } = await rq
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; name: string }[]
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => {
      const el = envoltorioRef.current
      if (el && !el.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  return (
    <div ref={envoltorioRef} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-2">
      {filteredCompanyId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Filtro activo:</span>
          <span className="font-medium text-gray-900">{filteredCompanyName ?? 'Cargando nombre…'}</span>
          <Link
            to={`/companies/${filteredCompanyId}/v2`}
            className="text-xs font-medium text-violet-700 hover:underline"
          >
            Ir a ficha empresa
          </Link>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearFilter}>
            Quitar filtro
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          className="pl-9 h-9 text-sm"
          placeholder={filteredCompanyId ? 'Buscar otra empresa por nombre…' : 'Buscar empresa por nombre…'}
          value={q}
          onChange={e => {
            setQ(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          aria-autocomplete="list"
          aria-expanded={abierto}
        />
        {abierto && (
          <ul
            className={cn(
              'absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-md',
            )}
            role="listbox"
          >
            {isFetching && <li className="px-3 py-2 text-gray-400 text-xs">Cargando empresas…</li>}
            {!isFetching && debounced.length === 1 && (
              <li className="px-3 py-2 text-gray-500 text-xs">Escriba al menos 2 letras para filtrar por nombre.</li>
            )}
            {!isFetching && debounced.length >= 2 && opciones.length === 0 && (
              <li className="px-3 py-2 text-gray-500 text-xs">No se encontraron empresas.</li>
            )}
            {!isFetching && debounced.length === 0 && (
              <li className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wide">Primeras empresas (ord. alfabético)</li>
            )}
            {!isFetching && debounced.length !== 1 &&
              opciones.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-violet-50 text-gray-800"
                    onClick={() => {
                      onChooseCompany(c.id)
                      setQ('')
                      setAbierto(false)
                    }}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}
