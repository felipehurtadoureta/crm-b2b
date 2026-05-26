// Solo super_admin: listar perfiles, asignar rol y editar datos en la tabla public.profiles.
// Requiere políticas RLS que permitan UPDATE (ver supabase/sql/profiles_super_admin_update.sql).
import { useCallback, useEffect, useState } from 'react'
import { getSupabaseDashboardAuthUsersUrl, supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { Link, Navigate, useLocation } from 'react-router-dom'
import AdminOrganizationPage from './AdminOrganizationPage'
import AdminImportPage from './AdminImportPage'
import { adminTabFromPath, type AdminSettingsTab } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { Pencil, UserPlus } from 'lucide-react'
import { initialsFromFullName, kamAbbrOrInitials } from '@/lib/kamDisplay'

const ROLES: Role[] = ['super_admin', 'kam', 'reader']
/** Roles que se pueden asignar al invitar (no se crean super_admin desde la UI). */
const INVITE_ROLES: Exclude<Role, 'super_admin'>[] = ['kam', 'reader']

function AdminSettingsHeader({
  tab,
  settingsTabClass,
}: {
  tab: AdminSettingsTab
  settingsTabClass: (id: AdminSettingsTab) => string
}) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Administración</h1>
        <p className="text-sm text-gray-500 mt-1">Usuarios, marca de la organización e importación masiva.</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-gray-200">
        <Link to="/admin/users" className={settingsTabClass('users')}>
          Usuarios
        </Link>
        <Link to="/admin/users?tab=organization" className={settingsTabClass('organization')}>
          Organización
        </Link>
        <Link to="/admin/users?tab=import" className={settingsTabClass('import')}>
          Importar Excel
        </Link>
      </nav>
    </div>
  )
}

type Draft = {
  full_name: string
  email: string
  phone: string
  is_active: boolean
  role: Role
  /** Abreviatura en listados (empresas, contactos); vacío = iniciales automáticas */
  display_abbr: string
}

function toDraft(p: Profile): Draft {
  return {
    full_name: p.full_name ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    is_active: p.is_active,
    role: p.role,
    display_abbr: p.display_abbr ?? '',
  }
}

/** Mensaje legible cuando falla supabase.functions.invoke (red, relay, HTTP). */
async function formatInviteFunctionError(err: unknown): Promise<string> {
  if (err instanceof FunctionsFetchError) {
    const inner = err.context
    const innerMsg = inner instanceof Error ? inner.message : String(inner ?? '')
    let host = ''
    try {
      host = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname
    } catch {
      /* ignore */
    }
    return [
      'No se pudo conectar con el endpoint de Edge Functions (el navegador no completó la petición).',
      innerMsg ? `Detalle: ${innerMsg}` : null,
      '',
      'Qué revisar:',
      host ? `• Host configurado (VITE_SUPABASE_URL): ${host}` : '• Que VITE_SUPABASE_URL sea una URL http(s) válida en tu .env',
      '• Si usás URL local (127.0.0.1 / localhost): tenés que tener Supabase levantado (`supabase start`). Sin eso, Auth puede fallar igual que las funciones.',
      '• Si el proyecto es en la nube: internet, firewall, VPN o extensiones que bloqueen URLs con "/functions/"',
      '• Después de crear la función: `supabase functions deploy invite-user` (o desplegarla desde el panel → Edge Functions).',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (err instanceof FunctionsRelayError) {
    return `${err.message} Si persiste, revisá el estado del proyecto en Supabase o probá más tarde.`
  }

  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response | undefined
    const status = res?.status
    try {
      const body = res && (await res.clone().json()) as { error?: string; message?: string }
      if (typeof body?.error === 'string') return body.error
      if (typeof body?.message === 'string') return body.message
    } catch {
      /* ignore */
    }
    if (status === 404) {
      return 'La función invite-user no está en este proyecto (HTTP 404). Desplegala: Dashboard → Edge Functions, o `supabase functions deploy invite-user`.'
    }
    return status ? `${err.message} (HTTP ${status})` : err.message
  }

  return err instanceof Error ? err.message : 'Error desconocido al invitar.'
}

export default function AdminUsersPage() {
  const dashboardAuthUsersUrl = getSupabaseDashboardAuthUsersUrl()
  const { profile, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [inviteDraft, setInviteDraft] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'reader' as Exclude<Role, 'super_admin'>,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name')
    if (qErr) setError(qErr.message)
    else setRows((data ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authLoading && profile?.role === 'super_admin') void load()
  }, [authLoading, profile?.role, load])

  const openEdit = (p: Profile) => {
    setEditing(p)
    setDraft(toDraft(p))
    setDialogOpen(true)
    setError(null)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditing(null)
    setDraft(null)
  }

  const openInvite = () => {
    setInviteDraft({ email: '', full_name: '', phone: '', role: 'reader' })
    setInviteError(null)
    setInviteSuccess(null)
    setInviteOpen(true)
  }

  const closeInvite = () => {
    setInviteOpen(false)
    setInviteError(null)
    setInviteSuccess(null)
  }

  const sendInvite = async () => {
    const email = inviteDraft.email.trim().toLowerCase()
    const full_name = inviteDraft.full_name.trim()
    const phone = inviteDraft.phone.trim()
    if (!email) {
      setInviteError('El correo es obligatorio.')
      return
    }
    if (!full_name) {
      setInviteError('El nombre es obligatorio.')
      return
    }
    setInviteSaving(true)
    setInviteError(null)
    setInviteSuccess(null)

    const { data, error: fnErr } = await supabase.functions.invoke<{
      ok?: boolean
      error?: string
      message?: string
    }>('invite-user', {
      body: {
        email,
        full_name,
        phone: phone || undefined,
        role: inviteDraft.role,
        // Mismo origen que el navegador (p. ej. http://localhost:5173) para que el mail no apunte a :3000 u otro puerto
        app_origin: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })

    setInviteSaving(false)

    const bodyErr = data && typeof data === 'object' && 'error' in data ? data.error : undefined
    if (fnErr) {
      setInviteError(bodyErr || (await formatInviteFunctionError(fnErr)))
      return
    }
    if (bodyErr) {
      setInviteError(bodyErr)
      return
    }
    if (data?.ok) {
      setInviteSuccess(data.message ?? 'Invitación enviada.')
      void load()
      return
    }
    setInviteError('Respuesta inesperada del servidor.')
  }

  const saveUser = async () => {
    if (!editing || !draft) return
    const full_name = draft.full_name.trim()
    if (!full_name) {
      setError('El nombre es obligatorio.')
      return
    }
    setSaving(true)
    setError(null)

    const payload: Partial<Profile> = {
      full_name,
      email: draft.email.trim(),
      phone: draft.phone.trim() || undefined,
      is_active: draft.is_active,
      role: draft.role,
      display_abbr: draft.display_abbr.trim() || null,
    }

    const { error: uErr } = await supabase.from('profiles').update(payload).eq('id', editing.id)
    setSaving(false)
    if (uErr) {
      setError(uErr.message)
      return
    }
    closeDialog()
    void load()
  }

  if (!authLoading && profile?.role !== 'super_admin') {
    return <Navigate to="/" replace />
  }

  const location = useLocation()
  const tab: AdminSettingsTab = adminTabFromPath(location.pathname, location.search)

  const settingsTabClass = (id: AdminSettingsTab) =>
    cn(
      'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
      tab === id ? 'border-violet-600 text-violet-800' : 'border-transparent text-gray-500 hover:text-gray-800',
    )

  if (tab === 'organization') {
    return (
      <div className="max-w-5xl space-y-6">
        <AdminSettingsHeader tab={tab} settingsTabClass={settingsTabClass} />
        <AdminOrganizationPage embedded />
      </div>
    )
  }

  if (tab === 'import') {
    return (
      <div className="max-w-5xl space-y-6">
        <AdminSettingsHeader tab={tab} settingsTabClass={settingsTabClass} />
        <AdminImportPage embedded />
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <AdminSettingsHeader tab={tab} settingsTabClass={settingsTabClass} />
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Usuarios del CRM</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Aquí se lee y se actualiza la tabla <span className="font-mono">profiles</span> en Supabase (nombre, correo
          mostrado en el CRM, teléfono, si está activo y rol). Para que el guardado funcione, en Supabase tienes que
          tener políticas RLS que permitan a <span className="font-medium">super_admin</span> hacer{' '}
          <span className="font-mono">UPDATE</span> en esa tabla (ejemplo en{' '}
          <span className="font-mono">supabase/sql/profiles_super_admin_update.sql</span>).
        </p>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3 max-w-2xl">
          <span className="font-medium">Importante:</span> el inicio de sesión usa el correo de{' '}
          <span className="font-mono">Auth</span> de Supabase. Cambiar el correo solo en <span className="font-mono">profiles</span>{' '}
          puede no cambiar el correo con el que la persona entra; lo habitual es alinear ambos con un flujo en backend
          o gestionar usuarios desde el panel de Supabase Auth.
        </p>
        <p className="text-sm text-gray-600 mt-3 max-w-2xl">
          <span className="font-medium">Invitar usuarios:</span> el botón &quot;Invitar usuario&quot; usa la Edge Function{' '}
          <span className="font-mono">invite-user</span> (rol de servicio). Desplegala con{' '}
          <span className="font-mono">supabase functions deploy invite-user</span>, definí el secreto{' '}
          <span className="font-mono">SITE_URL</span> y ejecutá{' '}
          <span className="font-mono">supabase/sql/profiles_on_auth_user_created.sql</span> para crear la fila en{' '}
          <span className="font-mono">profiles</span> al aceptar la invitación.
        </p>
        <div className="text-sm text-gray-700 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mt-4 max-w-2xl space-y-2">
          <p className="font-medium text-gray-900">Si al invitar sigue saliendo &quot;Failed to fetch&quot;</p>
          <ol className="list-decimal list-inside space-y-1.5 text-gray-600">
            <li>
              Cerrá y volvé a ejecutar <span className="font-mono">npm run dev</span> (o <span className="font-mono">npm run preview</span>) para que cargue el proxy de Vite.
            </li>
            <li>
              En la carpeta del proyecto (con Supabase CLI instalada):{' '}
              <span className="font-mono">supabase login</span>, <span className="font-mono">supabase link</span>, luego{' '}
              <span className="font-mono">supabase functions deploy invite-user</span>.
            </li>
            <li>
              Secreto <span className="font-mono">SITE_URL</span> (producción o si no invitás desde el CRM abierto en local):{' '}
              <span className="font-mono">supabase secrets set SITE_URL=https://tu-crm.com</span>. Con Vite en tu PC, invitá con el CRM abierto en{' '}
              <span className="font-mono">localhost:5173</span>: el enlace del mail usará ese origen automáticamente.
            </li>
            <li>
              En Supabase → Authentication → URL configuration → Redirect URLs, incluí cada origen que uses +{' '}
              <span className="font-mono">/auth/reset-password</span> (ej. <span className="font-mono">http://localhost:5173/auth/reset-password</span>).
            </li>
            <li>
              Si abrís el CRM en un <span className="font-medium">dominio publicado</span> (Vercel, Netlify, etc.), el proxy de localhost no aplica: la función tiene que estar desplegada en ese mismo proyecto y las URLs bien configuradas.
            </li>
          </ol>
          {dashboardAuthUsersUrl && (
            <p className="pt-1 text-gray-600">
              Mientras tanto podés invitar desde el panel:{' '}
              <a
                href={dashboardAuthUsersUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline font-medium"
              >
                Authentication → Users
              </a>
              . Si ya ejecutaste el SQL del trigger, al aceptar el correo se crea la fila en <span className="font-mono">profiles</span>.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="gap-1.5" onClick={openInvite}>
          <UserPlus size={16} /> Invitar usuario
        </Button>
      </div>

      {loading && <p className="text-sm text-gray-400">Cargando usuarios…</p>}
      {error && !dialogOpen && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Abrev.</th>
                <th className="px-4 py-3">Email (profiles)</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.full_name}</td>
                  <td
                    className="px-4 py-3 text-gray-700 font-mono text-xs"
                    title={r.full_name}
                  >
                    {kamAbbrOrInitials({ full_name: r.full_name, display_abbr: r.display_abbr })}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.email}</td>
                  <td className="px-4 py-3 text-gray-600">{r.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{r.role}</td>
                  <td className="px-4 py-3">
                    {r.is_active ? <span className="text-emerald-600 text-xs">Sí</span> : <span className="text-gray-400 text-xs">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openEdit(r)}>
                      <Pencil size={12} /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
        Actualizar lista
      </Button>

      <Dialog open={inviteOpen} onOpenChange={open => { if (!open) closeInvite() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitar usuario</DialogTitle>
            <DialogDescription>
              Se enviará un correo de invitación de Supabase Auth. La persona definirá su contraseña desde el enlace
              (misma ruta que recuperación de clave).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {inviteError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 whitespace-pre-line">
                {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {inviteSuccess}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Correo (Auth)</Label>
              <Input
                id="inv-email"
                type="email"
                autoComplete="off"
                value={inviteDraft.email}
                onChange={e => setInviteDraft(d => ({ ...d, email: e.target.value }))}
                placeholder="nombre@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Nombre completo</Label>
              <Input
                id="inv-name"
                value={inviteDraft.full_name}
                onChange={e => setInviteDraft(d => ({ ...d, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-phone">Teléfono (opcional)</Label>
              <Input
                id="inv-phone"
                value={inviteDraft.phone}
                onChange={e => setInviteDraft(d => ({ ...d, phone: e.target.value }))}
                placeholder="+56 9 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-role">Rol inicial</Label>
              <select
                id="inv-role"
                className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm"
                value={inviteDraft.role}
                onChange={e =>
                  setInviteDraft(d => ({ ...d, role: e.target.value as Exclude<Role, 'super_admin'> }))
                }
              >
                {INVITE_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeInvite} disabled={inviteSaving}>
              {inviteSuccess ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!inviteSuccess && (
              <Button type="button" onClick={() => void sendInvite()} disabled={inviteSaving}>
                {inviteSaving ? 'Enviando…' : 'Enviar invitación'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Cambios en la tabla <span className="font-mono">profiles</span>. Si RLS bloquea el guardado, verás el error de Supabase.
            </DialogDescription>
          </DialogHeader>
          {draft && editing && (
            <div className="space-y-3 py-1">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="fu-name">Nombre completo</Label>
                <Input
                  id="fu-name"
                  value={draft.full_name}
                  onChange={e => setDraft(d => d ? { ...d, full_name: e.target.value } : d)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-abbr">Abreviatura en tablas (opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="fu-abbr"
                    value={draft.display_abbr}
                    onChange={e => setDraft(d => d ? { ...d, display_abbr: e.target.value } : d)}
                    placeholder={initialsFromFullName(draft.full_name)}
                    maxLength={32}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 text-xs"
                    onClick={() =>
                      setDraft(d =>
                        d ? { ...d, display_abbr: initialsFromFullName(d.full_name) } : d,
                      )
                    }
                  >
                    Iniciales
                  </Button>
                </div>
                <p className="text-[11px] text-gray-500">Si queda vacío, el CRM muestra iniciales del nombre.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-email">Correo (profiles)</Label>
                <Input
                  id="fu-email"
                  type="email"
                  value={draft.email}
                  onChange={e => setDraft(d => d ? { ...d, email: e.target.value } : d)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-phone">Teléfono</Label>
                <Input
                  id="fu-phone"
                  value={draft.phone}
                  onChange={e => setDraft(d => d ? { ...d, phone: e.target.value } : d)}
                  placeholder="+56 9 …"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-role">Rol</Label>
                <select
                  id="fu-role"
                  className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm"
                  value={draft.role}
                  disabled={editing.id === profile?.id}
                  onChange={e => setDraft(d => d ? { ...d, role: e.target.value as Role } : d)}
                >
                  {ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                {editing.id === profile?.id && (
                  <p className="text-[11px] text-gray-500">No puedes cambiar tu propio rol desde aquí.</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={draft.is_active}
                  onChange={e => setDraft(d => d ? { ...d, is_active: e.target.checked } : d)}
                />
                Usuario activo
              </label>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void saveUser()} disabled={saving || !draft}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
