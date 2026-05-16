// Importación masiva de empresas y contactos desde Excel (solo super_admin)
import { useCallback, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  readWorkbookFromArrayBuffer,
  parseCompanyRows,
  parseContactRows,
  normCompanyKey,
  type ExcelCompanyDraft,
  type ExcelContactDraft,
  type ParsedWorkbook,
} from '@/lib/crmExcelImport'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function registerCompanyKeys(map: Map<string, string>, name: string, rut: string | null, id: string) {
  map.set(normCompanyKey(name, rut), id)
  const nk = normCompanyKey(name, null)
  if (!map.has(nk)) map.set(nk, id)
}

function resolveCompanyId(map: Map<string, string>, c: ExcelContactDraft): string | undefined {
  const k1 = normCompanyKey(c.companyName, c.companyRut)
  if (map.has(k1)) return map.get(k1)
  const k2 = normCompanyKey(c.companyName, null)
  if (map.has(k2)) return map.get(k2)
  return undefined
}

async function runImport(
  companies: ExcelCompanyDraft[],
  contacts: ExcelContactDraft[],
  onLog: (s: string) => void,
): Promise<{ createdCompanies: number; skippedCompanies: number; createdContacts: number; errors: number }> {
  let createdCompanies = 0
  let skippedCompanies = 0
  let createdContacts = 0
  let errors = 0

  const companyKeyToId = new Map<string, string>()

  const { data: existingRows, error: exErr } = await supabase.from('companies').select('id,name,rut')
  if (exErr) {
    onLog(`Error leyendo empresas existentes: ${exErr.message}`)
    errors++
    return { createdCompanies, skippedCompanies, createdContacts, errors }
  }
  for (const row of existingRows ?? []) {
    registerCompanyKeys(companyKeyToId, row.name, row.rut ?? null, row.id)
  }

  for (const d of companies) {
    const keyR = normCompanyKey(d.name, d.rut)
    if (companyKeyToId.has(keyR)) {
      onLog(`Fila ${d.rowNumber} empresa "${d.name}": ya existe (mismo nombre/RUT), se omite creación.`)
      skippedCompanies++
      continue
    }
    if (!d.rut) {
      const keyN = normCompanyKey(d.name, null)
      if (companyKeyToId.has(keyN)) {
        onLog(`Fila ${d.rowNumber} empresa "${d.name}": ya existe por nombre, se omite.`)
        skippedCompanies++
        continue
      }
    }

    const payload = {
      name: d.name,
      rut: d.rut || null,
      industry: d.industry,
      website: d.website,
      address: d.address,
      city: d.city,
      country: d.country || 'Chile',
      phone: d.phone,
      status: d.status,
      notes: d.notes,
    }
    const { data: inserted, error } = await supabase.from('companies').insert(payload).select('id').single()
    if (error || !inserted) {
      onLog(`Fila ${d.rowNumber} empresa "${d.name}": ${error?.message ?? 'error desconocido'}`)
      errors++
      continue
    }
    registerCompanyKeys(companyKeyToId, d.name, d.rut, inserted.id)
    createdCompanies++
    onLog(`Fila ${d.rowNumber}: empresa creada "${d.name}" (${inserted.id.slice(0, 8)}…)`)

    if (d.leadKamEmail) {
      const email = d.leadKamEmail.trim().toLowerCase()
      const { data: kam } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
      if (kam) {
        await supabase.from('company_kams').update({ is_lead: false }).eq('company_id', inserted.id)
        const { error: kErr } = await supabase.from('company_kams').upsert(
          { company_id: inserted.id, kam_id: kam.id, is_lead: true },
          { onConflict: 'company_id,kam_id' },
        )
        if (kErr) onLog(`  KAM lead: ${kErr.message}`)
        else onLog(`  KAM lead asignado: ${email}`)
      } else {
        onLog(`  KAM lead: no hay perfil con email ${email}`)
      }
    }
  }

  const affectedCompanyIds = new Set<string>()

  for (const c of contacts) {
    const companyId = resolveCompanyId(companyKeyToId, c)
    if (!companyId) {
      onLog(`Fila ${c.rowNumber} contacto "${c.firstName} ${c.lastName}": empresa "${c.companyName}" no encontrada (revise nombre/RUT).`)
      errors++
      continue
    }
    const payload = {
      company_id: companyId,
      first_name: c.firstName.trim(),
      last_name: c.lastName.trim(),
      email: c.email || null,
      phone: c.phone || null,
      position: c.position || null,
      department: c.department || null,
      is_primary: c.isPrimary,
      is_active: c.isActive,
      notes: c.notes || null,
    }
    if (c.isPrimary) {
      await supabase.from('contacts').update({ is_primary: false }).eq('company_id', companyId)
    }
    const { error } = await supabase.from('contacts').insert(payload)
    if (error) {
      onLog(`Fila ${c.rowNumber} contacto "${c.firstName} ${c.lastName}": ${error.message}`)
      errors++
      continue
    }
    createdContacts++
    affectedCompanyIds.add(companyId)
    onLog(`Fila ${c.rowNumber}: contacto creado para empresa id ${companyId.slice(0, 8)}…`)
  }

  for (const companyId of affectedCompanyIds) {
    const { data: primaries } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_primary', true)
      .order('created_at', { ascending: true })
    if (primaries && primaries.length > 1) {
      const [, ...rest] = primaries
      await supabase.from('contacts').update({ is_primary: false }).in(
        'id',
        rest.map(p => p.id),
      )
    }
    const { data: lead } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_primary', true)
      .maybeSingle()
    if (lead) {
      await supabase.from('companies').update({ primary_contact_id: lead.id }).eq('id', companyId)
    }
  }

  return { createdCompanies, skippedCompanies, createdContacts, errors }
}

export default function AdminImportPage() {
  const { profile, loading } = useAuth()
  const wbRef = useRef<ParsedWorkbook | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [companySheet, setCompanySheet] = useState('')
  const [contactSheet, setContactSheet] = useState('')
  const [parsedCompanies, setParsedCompanies] = useState<ExcelCompanyDraft[]>([])
  const [parsedContacts, setParsedContacts] = useState<ExcelContactDraft[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [hasWorkbook, setHasWorkbook] = useState(false)

  const appendLog = useCallback((s: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('es-CL')}] ${s}`])
  }, [])

  const refreshParsed = useCallback((wb: ParsedWorkbook, compSheet: string, contSheet: string) => {
    const companies = compSheet ? parseCompanyRows(wb.getSheetRows(compSheet)) : []
    const contacts = contSheet ? parseContactRows(wb.getSheetRows(contSheet)) : []
    setParsedCompanies(companies)
    setParsedContacts(contacts)
  }, [])

  const onPickFile = async (file: File | null) => {
    setPreviewReset()
    if (!file) return
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setLogs([`[${new Date().toLocaleTimeString('es-CL')}] El archivo debe ser .xlsx o .xls`])
      return
    }
    const buf = await file.arrayBuffer()
    const wb = readWorkbookFromArrayBuffer(buf)
    wbRef.current = wb
    setHasWorkbook(true)
    setFileName(file.name)
    setSheetNames(wb.sheetNames)
    const first = wb.sheetNames[0] ?? ''
    const second = wb.sheetNames[1] ?? ''
    setCompanySheet(first)
    setContactSheet(second || '')
    refreshParsed(wb, first, second || '')
  }

  function setPreviewReset() {
    wbRef.current = null
    setHasWorkbook(false)
    setFileName(null)
    setSheetNames([])
    setCompanySheet('')
    setContactSheet('')
    setParsedCompanies([])
    setParsedContacts([])
    setLogs([])
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      const wb = wbRef.current
      if (!wb || !companySheet) throw new Error('Seleccioná un archivo Excel y la hoja de empresas.')
      const companies = parseCompanyRows(wb.getSheetRows(companySheet))
      const contacts = contactSheet ? parseContactRows(wb.getSheetRows(contactSheet)) : []
      setLogs([])
      appendLog(`Inicio: ${companies.length} empresas, ${contacts.length} contactos.`)
      const r = await runImport(companies, contacts, appendLog)
      appendLog(
        `Fin: empresas creadas ${r.createdCompanies}, omitidas ${r.skippedCompanies}, contactos ${r.createdContacts}, errores ${r.errors}.`,
      )
      return r
    },
  })

  const companiesPreview = parsedCompanies.slice(0, 500)
  const contactsPreview = parsedContacts.slice(0, 500)

  if (!loading && profile?.role !== 'super_admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Importar empresas y contactos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Solo super_admin. Subí un Excel (.xlsx). Podés usar dos hojas (empresas + contactos) como en tu archivo de ejemplo;
          el archivo no se sube al servidor: se procesa en el navegador y se inserta en Supabase con tu sesión.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-gray-500" />
          Archivo
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Excel (.xlsx / .xls)</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
              <Upload size={16} />
              <span>{fileName ?? 'Elegir archivo…'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                onChange={e => void onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        {sheetNames.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Hoja de empresas</Label>
              <Select
                value={companySheet}
                onValueChange={v => {
                  setCompanySheet(v)
                  const wb = wbRef.current
                  if (!wb) return
                  refreshParsed(wb, v, contactSheet)
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sheetNames.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Hoja de contactos (opcional)</Label>
              <Select
                value={contactSheet || '__none__'}
                onValueChange={v => {
                  const next = v === '__none__' ? '' : v
                  setContactSheet(next)
                  const wb = wbRef.current
                  if (!wb || !companySheet) return
                  refreshParsed(wb, companySheet, next)
                }}
              >
                <SelectTrigger><SelectValue placeholder="Sin hoja de contactos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No importar contactos —</SelectItem>
                  {sheetNames.map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {parsedCompanies.length + parsedContacts.length > 0 && (
          <p className="text-xs text-gray-500">
            Vista previa: {parsedCompanies.length} filas de empresas
            {contactSheet ? `, ${parsedContacts.length} filas de contactos` : ''} (en importación se usan todas las filas válidas).
          </p>
        )}

        {importMutation.isError && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle size={14} />
            {(importMutation.error as Error).message}
          </p>
        )}

        {importMutation.isSuccess && !importMutation.isPending && (
          <p className="text-sm text-emerald-700 flex items-center gap-1">
            <CheckCircle2 size={14} />
            Importación finalizada. Revisá el registro abajo.
          </p>
        )}

        <Button
          type="button"
          disabled={!companySheet || !hasWorkbook || importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          {importMutation.isPending ? 'Importando…' : 'Importar a Supabase'}
        </Button>
      </section>

      <section className="rounded-xl border border-amber-100 bg-amber-50/80 p-5 text-sm text-amber-950 space-y-2">
        <p className="font-medium">Columnas reconocidas (primera fila = cabeceras)</p>
        <p><span className="font-semibold">Empresas:</span>{' '}
          nombre / empresa / nombre_empresa / company / razón_social, rut, industria, sitio_web, dirección, ciudad, país, teléfono, estado (activo|inactivo|potencial), notas,
          email_kam (opcional; debe coincidir con <code className="text-xs bg-amber-100/80 px-1 rounded">profiles.email</code>).
        </p>
        <p><span className="font-semibold">Contactos:</span>{' '}
          empresa / nombre_empresa (texto igual a la empresa en la otra hoja o ya cargada en el CRM), rut_empresa (opcional),
          nombre / apellido, email, teléfono, cargo, departamento, principal (sí/no), activo (sí/no), notas.
        </p>
        <p className="text-xs text-amber-900/90">
          Filas sin nombre de empresa o sin nombre/apellido de contacto se omiten. Empresas duplicadas (mismo RUT o mismo nombre sin RUT) no se vuelven a crear; los contactos nuevos enlazan por nombre o RUT de empresa.
        </p>
      </section>

      {(companiesPreview.length > 0 || contactsPreview.length > 0) && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Vista previa (máx. 500 filas por tabla en pantalla)</h2>
          {companiesPreview.length > 0 && (
            <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">Nombre</th>
                    <th className="px-2 py-1 text-left">RUT</th>
                    <th className="px-2 py-1 text-left">Ciudad</th>
                    <th className="px-2 py-1 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {companiesPreview.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{r.rowNumber}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.rut ?? '—'}</td>
                      <td className="px-2 py-1">{r.city ?? '—'}</td>
                      <td className="px-2 py-1">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {contactsPreview.length > 0 && (
            <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">Empresa</th>
                    <th className="px-2 py-1 text-left">Nombre</th>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Principal</th>
                  </tr>
                </thead>
                <tbody>
                  {contactsPreview.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{r.rowNumber}</td>
                      <td className="px-2 py-1">{r.companyName}</td>
                      <td className="px-2 py-1">{r.firstName} {r.lastName}</td>
                      <td className="px-2 py-1">{r.email ?? '—'}</td>
                      <td className="px-2 py-1">{r.isPrimary ? 'sí' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {logs.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-gray-900 p-4 font-mono text-xs text-gray-100 max-h-80 overflow-y-auto">
          {logs.map((line, i) => (
            <div key={i} className={cn('whitespace-pre-wrap', line.includes('Error') && 'text-red-300')}>
              {line}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
