// Super admin: datos de marca y emisor (equivalente a config/company + logo en barra lateral).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { CRM_COMPANY_DEFAULTS } from '@/config/company'
import {
  fetchCrmAppSettingsMerged,
  type CrmAppSettingsMerged,
} from '@/lib/crmAppSettings'
import { CRM_APP_SETTINGS_QUERY_KEY } from '@/hooks/useCrmAppSettings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import SiiConnectionsSection from '@/components/sii/SiiConnectionsSection'

const BRANDING_BUCKET = 'crm-branding'
const LOGO_MAX_BYTES = 2 * 1024 * 1024

function toRowPayload(m: CrmAppSettingsMerged) {
  return {
    id: 1,
    display_name: m.displayName,
    tagline: m.tagline,
    legal_name: m.legalName,
    rut: m.rut,
    address: m.address,
    phone: m.phone,
    email: m.email,
    website: m.website,
    logo_url: m.logoUrl,
    updated_at: new Date().toISOString(),
  }
}

async function persistSettings(m: CrmAppSettingsMerged) {
  const row = toRowPayload(m)
  const { error } = await supabase.from('crm_app_settings').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

interface Props {
  /** Dentro de /admin/users con pestañas */
  embedded?: boolean
}

export default function AdminOrganizationPage({ embedded = false }: Props) {
  const qc = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const serverSnapshot = useRef<CrmAppSettingsMerged | null>(null)
  const [form, setForm] = useState<CrmAppSettingsMerged | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  const q = useQuery({
    queryKey: CRM_APP_SETTINGS_QUERY_KEY,
    queryFn: fetchCrmAppSettingsMerged,
  })

  useEffect(() => {
    if (q.data) {
      serverSnapshot.current = { ...q.data }
      setForm({ ...q.data })
    }
  }, [q.data])

  const saveMutation = useMutation({
    mutationFn: persistSettings,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: CRM_APP_SETTINGS_QUERY_KEY })
      setLocalError(null)
    },
    onError: (e: Error) => setLocalError(e.message),
  })

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !form) return
    if (!file.type.startsWith('image/')) {
      setLocalError('Use una imagen (PNG, JPEG o WebP).')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLocalError('El logo no debe superar 2 MB.')
      return
    }
    setLogoUploading(true)
    setLocalError(null)
    const path = `logo/${crypto.randomUUID()}_${file.name.replace(/[^\w.\-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from(BRANDING_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })
    if (upErr) {
      setLogoUploading(false)
      setLocalError(
        upErr.message.includes('Bucket') || upErr.message.includes('not found')
          ? 'Falta el bucket público "crm-branding". Ejecute supabase/sql/crm_branding_storage.sql.'
          : upErr.message,
      )
      return
    }
    const { data: pub } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path)
    const url = pub.publicUrl
    const next = { ...form, logoUrl: url }
    setForm(next)
    setLogoUploading(false)
    try {
      await persistSettings(next)
      await qc.invalidateQueries({ queryKey: CRM_APP_SETTINGS_QUERY_KEY })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Error al guardar la URL del logo.')
    }
  }

  if (q.isLoading || !form) {
    return <p className="text-sm text-gray-400 py-8">Cargando configuración…</p>
  }

  if (q.isError) {
    return (
      <div className="max-w-lg rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {q.error instanceof Error ? q.error.message : 'Error al cargar.'}
        <p className="mt-2 text-xs">
          Si la tabla no existe, ejecute <span className="font-mono">supabase/sql/crm_app_settings.sql</span> en el SQL Editor.
        </p>
      </div>
    )
  }

  const d = CRM_COMPANY_DEFAULTS

  return (
    <div className={embedded ? 'max-w-3xl space-y-6' : 'max-w-2xl space-y-6'}>
      {!embedded && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
            <Link to="/admin/users">
              <ArrowLeft size={14} />
              Volver a administración
            </Link>
          </Button>
        </div>
      )}
      <div>
        <h2 className={embedded ? 'text-lg font-semibold text-gray-900' : 'text-xl font-semibold text-gray-900'}>
          Organización y marca
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Estos datos sustituyen los valores por defecto de <span className="font-mono">src/config/company.ts</span> y definen el
          bloque emisor en cotizaciones impresas. El logo aparece en el menú lateral si está configurado.
        </p>
      </div>

      {localError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{localError}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="space-y-2">
          <Label>Logo (barra lateral)</Label>
          <div className="flex flex-wrap items-center gap-3">
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt=""
                className="h-12 max-w-[10rem] object-contain rounded border border-gray-100 bg-white p-1"
              />
            ) : (
              <span className="text-xs text-gray-400">Sin logo (se muestra solo el nombre).</span>
            )}
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void handleLogo(e)} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              <ImagePlus size={14} />
              {logoUploading ? 'Subiendo…' : 'Subir imagen'}
            </Button>
          </div>
          <p className="text-[11px] text-gray-400">PNG, JPEG o WebP. Máximo 2 MB. Requiere bucket <span className="font-mono">crm-branding</span>.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="displayName">Nombre en el menú (producto)</Label>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              placeholder={d.displayName}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tagline">Leyenda bajo el nombre</Label>
            <Input id="tagline" value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} placeholder={d.tagline} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="legalName">Razón social (emisor en cotizaciones)</Label>
            <Input id="legalName" value={form.legalName} onChange={e => setForm({ ...form, legalName: e.target.value })} placeholder={d.legalName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rut">RUT</Label>
            <Input id="rut" value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder={d.rut} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder={d.phone} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder={d.address} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={d.email} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="website">Sitio web</Label>
            <Input id="website" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder={d.website} />
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const s = serverSnapshot.current
              if (s) setForm({ ...s })
            }}
            disabled={saveMutation.isPending}
          >
            Deshacer cambios locales
          </Button>
          <Button type="button" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      <SiiConnectionsSection />
    </div>
  )
}
