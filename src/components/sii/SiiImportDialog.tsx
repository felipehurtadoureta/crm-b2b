/**
 * Importar RCV del SII desde uno o varios archivos CSV/Excel (sin BaseAPI).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, FileSpreadsheet, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SII_HONORARIUM_QUERY_KEY,
  SII_PURCHASES_QUERY_KEY,
  SII_SALES_QUERY_KEY,
} from '@/lib/siiDocumentsQuery'
import { SII_CONNECTIONS_QUERY_KEY } from '@/lib/siiConnectionsQuery'
import {
  buildSiiFileEntry,
  fmtSiiBatchImportSummary,
  parseSiiRcvFile,
  type SiiBatchImportItem,
  type SiiFileEntry,
  type SiiFileImportType,
} from '@/lib/siiFileImport'
import { rcvKindLabel, resolveRcvImportType } from '@/lib/siiRcvDetect'
import { invokeSiiImport } from '@/lib/siiSync'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  importType: SiiFileImportType
  defaultPeriodo: string
}

const SII_FILE_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function isSiiFile(f: File) {
  return /\.(csv|xlsx|xls)$/i.test(f.name)
}

export default function SiiImportDialog({
  open,
  onOpenChange,
  connectionId,
  importType,
  defaultPeriodo,
}: Props) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [defaultPeriod, setDefaultPeriod] = useState(defaultPeriodo)
  const [entries, setEntries] = useState<SiiFileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [batchDetails, setBatchDetails] = useState<SiiBatchImportItem[]>([])

  const typeLabel =
    importType === 'honorarios'
      ? 'Honorarios'
      : 'RCV Compras y Ventas (detección automática)'

  const reset = useCallback(() => {
    setEntries([])
    setDragOver(false)
    setImportProgress(null)
    setLocalError(null)
    setSuccessMsg(null)
    setBatchDetails([])
    setDefaultPeriod(defaultPeriodo)
    if (inputRef.current) inputRef.current.value = ''
  }, [defaultPeriodo])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const addFiles = async (files: FileList | File[]) => {
    setLocalError(null)
    setSuccessMsg(null)
    setBatchDetails([])

    const list = Array.from(files).filter(isSiiFile)
    if (list.length === 0) {
      setLocalError('Seleccione archivos CSV o Excel (.csv, .xlsx, .xls).')
      return
    }

    const parsed = await Promise.all(list.map(f => buildSiiFileEntry(f, defaultPeriod)))
    setEntries(prev => {
      const ids = new Set(prev.map(e => e.id))
      return [...prev, ...parsed.filter(p => !ids.has(p.id))]
    })
  }

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const updatePeriodo = (id: string, periodo: string) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, periodo } : e)))
  }

  const validEntries = entries.filter(e => !e.error && e.rowCount != null)
  const hasErrors = entries.some(e => e.error)

  const importMut = useMutation({
    mutationFn: async () => {
      if (validEntries.length === 0) throw new Error('No hay archivos válidos para importar.')

      const results: SiiBatchImportItem[] = []
      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i]
        setImportProgress(`Importando ${i + 1} de ${validEntries.length}: ${entry.file.name}`)
        if (!/^\d{4}-\d{2}$/.test(entry.periodo)) {
          results.push({
            fileName: entry.file.name,
            periodo: entry.periodo,
            inserted: 0,
            skipped: 0,
            error: 'Período inválido (use YYYY-MM)',
          })
          continue
        }
        try {
          const parsed = await parseSiiRcvFile(entry.file, entry.periodo)
          const resolved = resolveRcvImportType(importType, parsed.rows, entry.file.name)
          const r = await invokeSiiImport({
            connection_id: connectionId,
            import_type: importType,
            periodo: entry.periodo,
            rows: parsed.rows,
            filename: entry.file.name,
          })
          results.push({
            fileName: entry.file.name,
            periodo: entry.periodo,
            inserted: r.inserted,
            skipped: r.skipped,
            importType: r.import_type,
            warning: r.type_warning ?? resolved.warning,
          })
        } catch (e) {
          results.push({
            fileName: entry.file.name,
            periodo: entry.periodo,
            inserted: 0,
            skipped: 0,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
      return results
    },
    onSuccess: async results => {
      setImportProgress(null)
      setBatchDetails(results)
      setSuccessMsg(fmtSiiBatchImportSummary(results))
      if (results.some(r => r.error)) {
        setLocalError('Algunos archivos no se importaron. Revise el detalle abajo.')
      } else {
        setLocalError(null)
        setEntries([])
        if (inputRef.current) inputRef.current.value = ''
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: SII_CONNECTIONS_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SII_PURCHASES_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SII_SALES_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SII_HONORARIUM_QUERY_KEY }),
      ])
    },
    onError: (e: Error) => {
      setImportProgress(null)
      setSuccessMsg(null)
      setLocalError(e.message)
    },
  })

  const handleClose = (next: boolean) => {
    if (!next && !importMut.isPending) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {typeLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
            <li>Ingrese a <span className="font-medium">www.sii.cl</span> con RUT y clave tributaria.</li>
            <li>Menú <span className="font-medium">Servicios online → Factura electrónica → Registro de compras y ventas</span>.</li>
            {importType === 'honorarios' ? (
              <li>Descargue el archivo de <span className="font-medium">Honorarios</span>.</li>
            ) : (
              <>
                <li>
                  Descargue el detalle de <span className="font-medium">Compras</span> (RUT Proveedor) o{' '}
                  <span className="font-medium">Ventas</span> (Rut cliente), por mes.
                </li>
                <li>
                  Puede subir <span className="font-medium">varios archivos a la vez</span> (compras y ventas mezclados).
                  El sistema detecta el tipo por columnas y nombre (ej. <span className="font-mono">RCV_COMPRA_*</span>,{' '}
                  <span className="font-mono">RCV_VENTA_*</span>).
                </li>
              </>
            )}
            {importType === 'honorarios' && (
              <li>Puede subir <span className="font-medium">varios archivos a la vez</span> (distintos meses).</li>
            )}
          </ol>

          <div className="space-y-1">
            <Label className="text-xs">Período por defecto (si el nombre del archivo no lo indica)</Label>
            <input
              type="month"
              value={defaultPeriod}
              onChange={e => setDefaultPeriod(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-200 px-3 text-sm"
            />
          </div>

          <div
            className={cn(
              'rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
              dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200',
            )}
            onDragOver={e => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              void addFiles(e.dataTransfer.files)
            }}
          >
            <Upload size={22} className="mx-auto text-gray-400 mb-2" />
            <p className="text-xs text-gray-600">Arrastre archivos aquí o selecciónelos</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={SII_FILE_ACCEPT}
              className="hidden"
              onChange={e => {
                if (e.target.files?.length) void addFiles(e.target.files)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              Elegir archivos
            </Button>
          </div>

          {entries.length > 0 && (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {entries.map(entry => (
                <li
                  key={entry.id}
                  className={cn(
                    'rounded-md border px-3 py-2 text-xs flex gap-2 items-start',
                    entry.error ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50',
                  )}
                >
                  <FileSpreadsheet size={14} className="shrink-0 mt-0.5 text-gray-500" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium truncate">{entry.file.name}</p>
                    {entry.error ? (
                      <p className="text-red-700 flex gap-1 items-start">
                        <AlertCircle size={12} className="shrink-0 mt-0.5" />
                        {entry.error}
                      </p>
                    ) : (
                      <>
                        <p className="text-gray-500">{entry.rowCount} filas detectadas</p>
                        {entry.detectedKind && entry.detectedKind !== 'unknown' && importType !== 'honorarios' && (
                          <p className="text-gray-500">
                            Detectado: <span className="font-medium">{rcvKindLabel(entry.detectedKind)}</span>
                          </p>
                        )}
                        {entry.detectedKind === 'unknown' && importType !== 'honorarios' && (
                          <p className="text-amber-700">Tipo no detectado; se usará la pestaña actual al importar.</p>
                        )}
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] text-gray-500 shrink-0">Período</Label>
                          <input
                            type="month"
                            value={entry.periodo}
                            onChange={e => updatePeriodo(entry.id, e.target.value)}
                            className="h-7 rounded border border-gray-200 px-2 text-xs"
                          />
                        </div>
                        {entry.warnings.map(w => (
                          <p key={w} className="text-amber-700">
                            {w}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-700 shrink-0"
                    disabled={importMut.isPending}
                    onClick={() => removeEntry(entry.id)}
                    aria-label="Quitar archivo"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasErrors && validEntries.length > 0 && (
            <p className="text-xs text-amber-700">
              Los archivos con error se omitirán. Los válidos ({validEntries.length}) se importarán.
            </p>
          )}

          {importProgress && (
            <p className="text-xs text-gray-500">{importProgress}</p>
          )}

          {successMsg && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
              {successMsg}
            </div>
          )}

          {batchDetails.length > 0 && (
            <ul className="text-xs space-y-1 text-gray-600">
              {batchDetails.map(d => (
                <li key={`${d.fileName}-${d.periodo}`}>
                  {d.error ? (
                    <span className="text-red-700">
                      {d.fileName}: {d.error}
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">{d.fileName}</span> ({d.periodo}): {d.inserted} nuevos
                      {d.skipped ? `, ${d.skipped} duplicados` : ''}
                      {d.importType && d.importType !== importType && d.importType !== 'honorarios' && (
                        <span className="text-amber-700"> → importado como {rcvKindLabel(d.importType)}</span>
                      )}
                      {d.warning && <span className="block text-amber-700">{d.warning}</span>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {localError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{localError}</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={importMut.isPending} onClick={() => handleClose(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={validEntries.length === 0 || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            <Upload size={14} />
            {importMut.isPending
              ? 'Importando…'
              : validEntries.length > 1
                ? `Importar ${validEntries.length} archivos`
                : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
