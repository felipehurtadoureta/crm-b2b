/**
 * Importar una o varias cartolas Banco de Chile (.xls, .xlsx) con arrastre.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react'
import {
  companyIdentityLabel,
  parseCartolaEmitidaFromFile,
  validateSameCompanyCartolas,
  type CartolaFileParseResult,
  type ParsedCartola,
} from '@/lib/bankCartolaImport'
import {
  findExistingImportHashes,
  findIntraBatchDuplicateFiles,
  getCartolaDuplicateStatus,
  importMultipleCartolasToSupabase,
  type CartolaDuplicateInfo,
} from '@/lib/bankBookQuery'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

interface FileEntry {
  id: string
  file: File
  parsed: ParsedCartola | null
  error: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

function isCartolaFile(f: File) {
  return /\.(xlsx|xls)$/i.test(f.name)
}

function duplicateStatusLabel(info: CartolaDuplicateInfo, batchTwin?: string): string | null {
  if (batchTwin) return `Duplicada en este lote (igual que ${batchTwin})`
  if (info.status === 'duplicate') return 'Ya importada en el libro de banco'
  if (info.status === 'partial') {
    const nuevos = info.total - info.existingCount
    return `${nuevos} movimiento(s) nuevo(s), ${info.existingCount} ya existían`
  }
  return null
}

async function parseFile(f: File): Promise<FileEntry> {
  const id = `${f.name}-${f.size}-${f.lastModified}`
  if (!isCartolaFile(f)) {
    return { id, file: f, parsed: null, error: 'Formato no válido (.xls o .xlsx).' }
  }
  try {
    const buf = await f.arrayBuffer()
    const parsed = await parseCartolaEmitidaFromFile(buf, f.name)
    if (parsed.movements.length === 0) {
      const warn = parsed.warnings.join(' ') || 'Sin movimientos.'
      return { id, file: f, parsed, error: warn }
    }
    return { id, file: f, parsed, error: null }
  } catch (e) {
    return {
      id,
      file: f,
      parsed: null,
      error: e instanceof Error ? e.message : 'No se pudo leer el archivo.',
    }
  }
}

export default function BankCartolaImportDialog({ open, onOpenChange, onImported }: Props) {
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [companyError, setCompanyError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setEntries([])
    setCompanyError(null)
    setDragOver(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const validParsed = useMemo(
    () => entries.filter((e): e is FileEntry & { parsed: ParsedCartola } => e.parsed != null && !e.error),
    [entries],
  )

  const companyCheck = useMemo(() => {
    if (validParsed.length === 0) return null
    const items: CartolaFileParseResult[] = validParsed.map(e => ({
      fileName: e.file.name,
      parsed: e.parsed,
    }))
    return validateSameCompanyCartolas(items)
  }, [validParsed])

  useEffect(() => {
    if (!companyCheck) {
      setCompanyError(null)
      return
    }
    setCompanyError(companyCheck.ok ? null : companyCheck.message)
  }, [companyCheck])

  const cartolaItems = useMemo(
    (): CartolaFileParseResult[] =>
      validParsed.map(e => ({ fileName: e.file.name, parsed: e.parsed })),
    [validParsed],
  )

  const intraBatchDup = useMemo(
    () => findIntraBatchDuplicateFiles(cartolaItems),
    [cartolaItems],
  )

  const dupCheckQ = useQuery({
    queryKey: [
      'bank-cartola-duplicate-check',
      cartolaItems.map(i => i.fileName + i.parsed.movements.length).join('|'),
    ],
    queryFn: async () => {
      const hashes = cartolaItems.flatMap(i => i.parsed.movements.map(m => m.importHash))
      const existing = await findExistingImportHashes(hashes)
      const map = new Map<string, CartolaDuplicateInfo>()
      for (const item of cartolaItems) {
        map.set(item.fileName, getCartolaDuplicateStatus(item.parsed, existing))
      }
      return map
    },
    enabled: open && cartolaItems.length > 0 && companyCheck?.ok === true,
  })

  const importableEntries = useMemo(() => {
    const statusMap = dupCheckQ.data
    return validParsed.filter(e => {
      if (intraBatchDup.has(e.file.name)) return false
      const st = statusMap?.get(e.file.name)
      if (st?.status === 'duplicate') return false
      return true
    })
  }, [validParsed, intraBatchDup, dupCheckQ.data])

  const totalNewMovements = useMemo(() => {
    const statusMap = dupCheckQ.data
    return importableEntries.reduce((sum, e) => {
      const st = statusMap?.get(e.file.name)
      if (!st || st.status === 'new') return sum + e.parsed.movements.length
      return sum + (st.total - st.existingCount)
    }, 0)
  }, [importableEntries, dupCheckQ.data])

  const preview = importableEntries[0]?.parsed.movements.slice(0, 5) ?? []

  const addFiles = async (list: FileList | File[]) => {
    const files = [...list].filter(isCartolaFile)
    if (files.length === 0) return
    const parsed = await Promise.all(files.map(parseFile))
    setEntries(prev => {
      const byId = new Map(prev.map(e => [e.id, e]))
      for (const p of parsed) byId.set(p.id, p)
      return [...byId.values()]
    })
  }

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Sin sesión.')
      const items: CartolaFileParseResult[] = importableEntries.map(e => ({
        fileName: e.file.name,
        parsed: e.parsed,
      }))
      if (items.length === 0) {
        throw new Error('No hay cartolas nuevas para importar. Todas están duplicadas.')
      }
      return importMultipleCartolasToSupabase(items, profile.id)
    },
    onSuccess: result => {
      onImported?.()
      onOpenChange(false)
      const lines = [
        result.filesImported > 0
          ? `${result.filesImported} cartola(s) importada(s), ${result.inserted} movimiento(s) nuevo(s).`
          : null,
        result.duplicateCartolas.length > 0
          ? `Omitidas (duplicadas): ${result.duplicateCartolas.join('; ')}`
          : null,
        result.skipped > 0 ? `${result.skipped} movimiento(s) ya existían y no se repitieron.` : null,
        result.errors.length > 0 ? `Avisos: ${result.errors.join(' | ')}` : null,
      ].filter(Boolean)
      alert(lines.join('\n\n'))
    },
    onError: (e: Error) => alert(e.message),
  })

  const canImport =
    importableEntries.length > 0 &&
    companyCheck?.ok === true &&
    profile?.role === 'super_admin' &&
    !importMutation.isPending &&
    !dupCheckQ.isLoading

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void addFiles(e.dataTransfer.files)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[min(92vh,48rem)] flex flex-col gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-gray-500 shrink-0" size={18} />
            Importar cartolas
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600 text-left pt-1">
            Arrastre uno o más archivos <span className="font-medium">Excel</span> (.xls, .xlsx). Todas deben ser de
            la <span className="font-medium">misma empresa</span>. Las cartolas ya importadas se omiten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 min-h-0 flex-1 overflow-y-auto">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <div
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
            }}
            onDragOver={e => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'rounded-lg border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-slate-600 bg-slate-50'
                : 'border-gray-300 bg-gray-50/80 hover:border-gray-400 hover:bg-gray-50',
            )}
          >
            <Upload className="mx-auto text-gray-400 mb-2" size={28} />
            <p className="text-sm font-medium text-gray-700">Arrastre cartolas aquí</p>
            <p className="text-xs text-gray-500 mt-1">Solo archivos Excel (.xls, .xlsx)</p>
          </div>

          {entries.length > 0 && (
            <ul className="space-y-1.5 text-xs">
              {entries.map(e => {
                const dupInfo = dupCheckQ.data?.get(e.file.name)
                const batchTwin = intraBatchDup.get(e.file.name)
                const dupLabel = dupInfo ? duplicateStatusLabel(dupInfo, batchTwin) : null
                const isDup =
                  Boolean(batchTwin) || dupInfo?.status === 'duplicate'

                return (
                  <li
                    key={e.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-2.5 py-2',
                      isDup ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{e.file.name}</p>
                      {e.error && <p className="text-red-600 mt-0.5">{e.error}</p>}
                      {e.parsed && !e.error && (
                        <p className="text-gray-600 mt-0.5">
                          {e.parsed.movements.length} movimiento(s) · {companyIdentityLabel(e.parsed.meta)}
                        </p>
                      )}
                      {dupLabel && !e.error && (
                        <p className={cn('mt-0.5', isDup ? 'text-amber-800 font-medium' : 'text-blue-700')}>
                          {dupLabel}
                        </p>
                      )}
                      {dupCheckQ.isLoading && e.parsed && !e.error && (
                        <p className="text-gray-400 mt-0.5">Comprobando duplicados…</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-gray-700 shrink-0 p-0.5"
                      onClick={ev => {
                        ev.stopPropagation()
                        removeEntry(e.id)
                      }}
                      aria-label="Quitar archivo"
                    >
                      <X size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {companyError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 whitespace-pre-line">
              <AlertCircle size={14} className="inline mr-1 -mt-0.5" />
              {companyError}
            </div>
          )}

          {companyCheck?.ok && validParsed.length > 0 && !companyError && (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 text-xs',
                importableEntries.length > 0
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900',
              )}
            >
              {importableEntries.length > 0 ? (
                <>
                  <CheckCircle2 size={14} className="inline mr-1 -mt-0.5" />
                  {importableEntries.length} cartola(s) por importar · ~{totalNewMovements} movimiento(s) nuevo(s)
                  {validParsed.length > importableEntries.length && (
                    <span className="block mt-1 text-amber-800">
                      {validParsed.length - importableEntries.length} archivo(s) duplicado(s) se omitirán.
                    </span>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="inline mr-1 -mt-0.5" />
                  Todas las cartolas están duplicadas. No hay nada nuevo para importar.
                </>
              )}
            </div>
          )}

          {preview.length > 0 && companyCheck?.ok && importableEntries.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-xs">
              <p className="text-gray-600 font-medium">
                Vista previa ({importableEntries[0]!.file.name})
              </p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-200">
                    <th className="py-1 pr-2">Fecha</th>
                    <th className="py-1 pr-2">Detalle</th>
                    <th className="py-1 pr-2 text-right">Cargo</th>
                    <th className="py-1 text-right">Abono</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(m => (
                    <tr key={m.importHash} className="border-b border-gray-100">
                      <td className="py-1 pr-2 whitespace-nowrap">{m.movementDate}</td>
                      <td className="py-1 pr-2 max-w-[10rem] truncate" title={m.description}>
                        {m.description}
                      </td>
                      <td className="py-1 pr-2 text-right text-red-700">{m.debit > 0 ? fmt(m.debit) : '—'}</td>
                      <td className="py-1 text-right text-green-700">{m.credit > 0 ? fmt(m.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canImport} onClick={() => importMutation.mutate()}>
            {importMutation.isPending
              ? 'Importando…'
              : `Importar ${importableEntries.length || ''} cartola(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}