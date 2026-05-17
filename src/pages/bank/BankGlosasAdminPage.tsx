/**
 * Administración de glosas contables (super_admin).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BANK_GLOSAS_QUERY_KEY,
  BANK_GLOSAS_SETUP_HINT,
  createBankGlosa,
  deleteBankGlosa,
  fetchBankGlosas,
  suggestGlosaCode,
  updateBankGlosa,
  type BankGlosa,
  type BankGlosaInput,
} from '@/lib/bankGlosas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'

const emptyForm: BankGlosaInput = {
  code: '',
  name: '',
  match_keywords: [],
  sort_order: 100,
  is_active: true,
}

export default function BankGlosasAdminPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<BankGlosa | null>(null)
  const [form, setForm] = useState<BankGlosaInput>(emptyForm)
  const [keywordsText, setKeywordsText] = useState('')
  const [testDesc, setTestDesc] = useState('PAGO EN SII.CL')
  const [formError, setFormError] = useState<string | null>(null)

  const glosasQ = useQuery({
    queryKey: BANK_GLOSAS_QUERY_KEY,
    queryFn: () => fetchBankGlosas({ activeOnly: false }),
  })

  const glosas = glosasQ.data ?? []
  const testSuggestion = suggestGlosaCode(testDesc, glosas.filter(g => g.is_active))

  const resetForm = () => {
    setEditing(null)
    setForm(emptyForm)
    setKeywordsText('')
    setFormError(null)
  }

  const loadEdit = (g: BankGlosa) => {
    setEditing(g)
    setForm({
      code: g.code,
      name: g.name,
      match_keywords: g.match_keywords,
      sort_order: g.sort_order,
      is_active: g.is_active,
    })
    setKeywordsText(g.match_keywords.join(', '))
    setFormError(null)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input: BankGlosaInput = {
        ...form,
        match_keywords: keywordsText
          .split(/[,;\n]+/)
          .map(s => s.trim())
          .filter(Boolean),
      }
      if (!input.code || !input.name) throw new Error('Código y nombre son obligatorios.')
      if (editing) {
        await updateBankGlosa(editing.id, input)
      } else {
        await createBankGlosa(input)
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: BANK_GLOSAS_QUERY_KEY })
      resetForm()
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBankGlosa,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: BANK_GLOSAS_QUERY_KEY })
      if (editing) resetForm()
    },
    onError: (e: Error) => alert(e.message),
  })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/bank"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Libro de banco
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Glosas contables</h1>
        <p className="text-sm text-gray-500 mt-1">
          Clasificación de movimientos (FC, FV, Pago IVA, Previred, etc.). Las palabras clave sugieren
          glosa según el texto de la descripción del banco.
        </p>
      </div>

      {glosasQ.isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {glosasQ.error instanceof Error ? glosasQ.error.message : 'Error'}
          <p className="text-xs mt-1">{BANK_GLOSAS_SETUP_HINT}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
          <h2 className="font-medium text-gray-900">{editing ? 'Editar glosa' : 'Nueva glosa'}</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Código</Label>
              <Input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="FC"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Orden</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Factura compra"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Palabras clave (separadas por coma)</Label>
            <textarea
              value={keywordsText}
              onChange={e => setKeywordsText(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="IVA, SII.CL, IMPUESTO"
            />
            <p className="text-xs text-gray-500">Si la descripción del movimiento contiene alguna, se sugiere esta glosa.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            Activa
          </label>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear glosa'}
            </Button>
            {editing && (
              <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="font-medium text-gray-900">Probar sugerencia</h2>
          <Input
            value={testDesc}
            onChange={e => setTestDesc(e.target.value)}
            placeholder="Texto como en la cartola…"
            className="text-sm"
          />
          <p className="text-sm">
            Sugerencia:{' '}
            <span className="font-semibold text-slate-800">{testSuggestion ?? '— (sin coincidencia)'}</span>
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-left text-xs text-gray-600">
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Palabras clave</th>
              <th className="px-3 py-2">Ord.</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {glosasQ.isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-gray-500">
                  Cargando…
                </td>
              </tr>
            )}
            {glosas.map(g => (
              <tr key={g.id} className={!g.is_active ? 'opacity-50' : ''}>
                <td className="px-3 py-2 font-mono font-medium">{g.code}</td>
                <td className="px-3 py-2">{g.name}</td>
                <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate" title={g.match_keywords.join(', ')}>
                  {g.match_keywords.join(', ') || '—'}
                </td>
                <td className="px-3 py-2">{g.sort_order}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => loadEdit(g)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-red-600"
                    onClick={() => {
                      if (confirm(`¿Eliminar glosa ${g.code}?`)) deleteMutation.mutate(g.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 border-t border-gray-100">
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={resetForm}>
            <Plus size={14} />
            Nueva glosa
          </Button>
        </div>
      </div>
    </div>
  )
}
