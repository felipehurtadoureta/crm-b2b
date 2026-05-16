import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { initialsFromFullName } from '@/lib/kamDisplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  fullName: string
  displayAbbr: string | null | undefined
  onSaved: () => void
}

/** Bloque para que el KAM edite su abreviatura en listados (vía RPC segura). */
export default function KamAbbrEditor({ fullName, displayAbbr, onSaved }: Props) {
  const [value, setValue] = useState((displayAbbr ?? '').trim())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setValue((displayAbbr ?? '').trim())
  }, [displayAbbr])

  const applyInitials = () => {
    setValue(initialsFromFullName(fullName))
    setErr(null)
  }

  const save = async () => {
    setSaving(true)
    setErr(null)
    const { error } = await supabase.rpc('set_my_display_abbr', { p_abbr: value.trim() })
    setSaving(false)
    if (error) {
      setErr(error.message)
      return
    }
    onSaved()
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm mb-6 max-w-md">
      <p className="text-sm font-medium text-gray-900">Tu abreviatura en tablas</p>
      <p className="text-xs text-gray-500 mt-1">
        Se muestra en empresas y contactos (ej. FHU). Si queda vacía, se usan las iniciales de tu nombre.
      </p>
      {err && (
        <p className="text-xs text-red-700 mt-2 rounded border border-red-100 bg-red-50 px-2 py-1.5">{err}</p>
      )}
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="kam-abbr">Abreviatura</Label>
        <Input
          id="kam-abbr"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={initialsFromFullName(fullName)}
          maxLength={32}
          autoComplete="off"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={applyInitials}>
          Rellenar con iniciales
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
