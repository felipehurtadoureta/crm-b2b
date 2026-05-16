/**
 * Modal para importar filas del catálogo desde Excel (.xlsx / .xls).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  parseProductRows,
  readWorkbookFromArrayBuffer,
  type ExcelProductDraft,
  type ParsedWorkbook,
} from '@/lib/crmExcelImport'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

async function fetchProductIdsBySku(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('products').select('id, sku')
  if (error) throw new Error(error.message)
  const m = new Map<string, string>()
  for (const row of data ?? []) {
    const sku = typeof row.sku === 'string' ? row.sku.trim() : ''
    if (!sku) continue
    const k = sku.toLowerCase()
    if (!m.has(k)) m.set(k, row.id as string)
  }
  return m
}

async function upsertImportedProducts(rows: ExcelProductDraft[]): Promise<{ log: string[]; ok: boolean }> {
  try {
    const skuToId = await fetchProductIdsBySku()
    const now = () => new Date().toISOString()

    const log: string[] = []
    let created = 0
    let updated = 0
    let errorsCount = 0

    const buildPayload = (d: ExcelProductDraft) => ({
      name: d.name,
      sku: d.sku,
      description: d.description,
      type: d.type,
      has_inventory: d.has_inventory,
      service_category: d.service_category,
      price: d.price,
      currency: d.currency,
      tax_rate: d.tax_rate,
      is_active: d.is_active,
      updated_at: now(),
    })

    for (const d of rows) {
      try {
        const skuKey = d.sku?.trim() ? d.sku.trim().toLowerCase() : ''
        /** Fila marcada tipo inventario: persiste como `inventory` en la misma tabla. */
        const typeForDb = d.type === 'inventory' ? ('inventory' as const) : d.type
        const payload = { ...buildPayload(d), type: typeForDb }

        const existingId = skuKey ? skuToId.get(skuKey) : undefined

        if (existingId) {
          const { error } = await supabase.from('products').update(payload).eq('id', existingId)
          if (error) throw error
          updated++
          log.push(`Fila ${d.rowNumber}: «${d.name}» actualizado por SKU (${d.sku ?? 'sin sku'}).`)
        } else {
          const { data: inserted, error } = await supabase.from('products').insert(payload).select('id').single()
          if (error || !inserted) throw error ?? new Error('Sin datos en insert.')
          created++
          if (skuKey) skuToId.set(skuKey, inserted.id as string)
          log.push(`Fila ${d.rowNumber}: «${d.name}» creado.`)
        }
      } catch (e) {
        errorsCount++
        const msg = e instanceof Error ? e.message : String(e)
        log.push(`Fila ${d.rowNumber} («${d.name}»): error — ${msg}`)
      }
    }

    log.unshift(
      `Listo: ${created} creado(s), ${updated} actualizado(s) por SKU, ${errorsCount} fila(s) con error.`,
    )
    return { log, ok: errorsCount === 0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { log: [`Error al importar: ${msg}`], ok: false }
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export default function ProductExcelImportDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>('')

  const drafts = useMemo((): ExcelProductDraft[] => {
    if (!workbook || !sheetName) return []
    try {
      return parseProductRows(workbook.getSheetRows(sheetName))
    } catch {
      return []
    }
  }, [workbook, sheetName])

  useEffect(() => {
    if (!open) {
      setFile(null)
      setWorkbook(null)
      setSheetName('')
    }
  }, [open])

  useEffect(() => {
    if (workbook?.sheetNames.length && !sheetName) {
      setSheetName(workbook.sheetNames[0])
    }
  }, [workbook, sheetName])

  const prefetchQ = useQuery({
    queryKey: ['products-sku-keys'],
    queryFn: fetchProductIdsBySku,
    staleTime: 30_000,
    enabled: open,
  })

  const importMutation = useMutation({
    mutationFn: (list: ExcelProductDraft[]) => upsertImportedProducts(list),
  })

  const onPickFile = async (f: File | null) => {
    setFile(f)
    if (!f) {
      setWorkbook(null)
      setSheetName('')
      return
    }
    try {
      const buf = await f.arrayBuffer()
      const wb = readWorkbookFromArrayBuffer(buf, { rawValues: true })
      setWorkbook(wb)
      setSheetName(wb.sheetNames[0] ?? '')
    } catch {
      setWorkbook(null)
      setSheetName('')
      alert('No se pudo leer el libro. Revise formato (.xlsx o .xls).')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[min(90vh,42rem)] flex flex-col gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-gray-500 shrink-0" size={18} />
            Importar productos desde Excel
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600 leading-relaxed text-left pt-1">
            Primera fila: encabezados. Columnas sugeridas:{' '}
            <span className="font-medium text-gray-800">nombre</span>, <span className="font-medium">sku</span>,{' '}
            <span className="font-medium">tipo</span> (producto / servicio / inventario){' '}
            y <span className="font-medium">precio</span>.
            Opcionales: descripción, moneda (CLP, USD o UF); IVA: si la celda va vacía se usa 19; activo sí/no;
            stock sí/no solo para físicos; categoría tiene sentido para servicios (rubro/categoría servicio).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 min-h-0 flex-1 flex flex-col">
          <div className="space-y-1.5">
            <Label className="text-xs">Archivo</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={e => void onPickFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} />
                Elegir Excel
              </Button>
              {file != null ? (
                <span className="text-xs text-gray-600 truncate max-w-[14rem]" title={file.name}>
                  {file.name}
                </span>
              ) : (
                <span className="text-xs text-gray-400">Sin archivo</span>
              )}
            </div>
          </div>

          {workbook != null && workbook.sheetNames.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Hoja</Label>
              <Select value={sheetName} onValueChange={setSheetName}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleccione hoja" />
                </SelectTrigger>
                <SelectContent>
                  {workbook.sheetNames.map(nm => (
                    <SelectItem key={nm} value={nm}>
                      {nm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {drafts.length > 0 ? (
            <p className="text-xs text-gray-600 shrink-0">
              <strong className="text-gray-800">{drafts.length}</strong> filas reconocidas. Si el SKU ya existe, se actualiza ese
              registro.
            </p>
          ) : workbook != null && sheetName !== '' ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shrink-0">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              No hay filas con columna de nombre válida en esta hoja.
            </div>
          ) : null}

          {prefetchQ.isLoading && <p className="text-xs text-gray-400">Verificando productos existentes…</p>}
          {prefetchQ.isError && prefetchQ.error instanceof Error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 shrink-0">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {prefetchQ.error.message}
            </div>
          )}

          {importMutation.isSuccess && importMutation.data?.log?.length !== undefined ? (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 flex flex-col gap-1 min-h-0 flex-1 max-h-[12rem]',
                importMutation.data?.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
              )}
            >
              <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 shrink-0">
                <CheckCircle2 size={13} />
                Bitácora de importación
              </div>
              <pre className="text-[11px] text-gray-800 whitespace-pre-wrap overflow-y-auto overscroll-contain flex-1 min-h-[4rem]">
                {importMutation.data.log.join('\n')}
              </pre>
            </div>
          ) : importMutation.isError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 shrink-0">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {importMutation.error instanceof Error ? importMutation.error.message : 'Error'}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 flex-col sm:flex-row gap-2 sm:justify-between sm:gap-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            disabled={importMutation.isPending}
            onClick={() => importMutation.reset()}
          >
            Limpiar resultado
          </Button>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs gap-1.5 min-w-[7rem]"
              disabled={
                drafts.length === 0 || importMutation.isPending || prefetchQ.isFetching || prefetchQ.isLoading || prefetchQ.isError
              }
              onClick={() =>
                importMutation.mutate(drafts, {
                  onSuccess: () => {
                    void prefetchQ.refetch()
                    onImported?.()
                  },
                })
              }
            >
              {importMutation.isPending ? 'Importando…' : 'Importar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
