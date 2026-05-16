/**
 * Importar filas de inventario físico desde Excel (una fila = un número de serie).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  parseInventorySerialRows,
  readWorkbookFromArrayBuffer,
  type ExcelInventorySerialDraft,
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

const ESTADOS_VALIDOS = new Set(['disponible', 'reservado', 'vendido', 'dañado'])

function normalizarNombreProducto(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function estadoSeguro(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (t === 'danado') return 'dañado'
  if (ESTADOS_VALIDOS.has(t)) return t
  return 'disponible'
}

async function importarFilasInventario(rows: ExcelInventorySerialDraft[]): Promise<{ log: string[]; ok: boolean }> {
  const log: string[] = []
  let insertados = 0
  let omitidos = 0
  let errores = 0
  let productosCreados = 0

  try {
    const { data: productos, error: prodErr } = await supabase.from('products').select('id, name')
    if (prodErr) throw new Error(prodErr.message)

    const nombreAId = new Map<string, string>()
    for (const p of productos ?? []) {
      const k = normalizarNombreProducto(String((p as { name: string }).name))
      if (!nombreAId.has(k)) nombreAId.set(k, (p as { id: string }).id)
    }

    const vistosEnArchivo = new Set<string>()

    for (const r of rows) {
      const nk = normalizarNombreProducto(r.productName)
      let productId = nombreAId.get(nk)

      if (!productId) {
        const { data: nuevo, error: insPErr } = await supabase
          .from('products')
          .insert({
            name: r.productName.trim(),
            type: 'product',
            has_inventory: true,
            price: 0,
            currency: 'CLP',
            tax_rate: 19,
            is_active: true,
          })
          .select('id')
          .single()
        if (insPErr || !nuevo) {
          errores++
          log.push(`Fila ${r.rowNumber}: no se pudo crear producto «${r.productName}» — ${insPErr?.message ?? 'sin id'}`)
          continue
        }
        productId = nuevo.id as string
        nombreAId.set(nk, productId)
        productosCreados++
        log.push(`Fila ${r.rowNumber}: producto «${r.productName.trim()}» creado en catálogo (sin precio de lista).`)
      }

      const serieNorm = r.serialNumber.trim()
      const claveArchivo = `${productId}:${serieNorm.toLowerCase()}`
      if (vistosEnArchivo.has(claveArchivo)) {
        omitidos++
        log.push(`Fila ${r.rowNumber}: serie duplicada en el archivo («${serieNorm}»), omitida.`)
        continue
      }
      vistosEnArchivo.add(claveArchivo)

      const { data: yaExiste } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('product_id', productId)
        .eq('serial_number', serieNorm)
        .maybeSingle()

      if (yaExiste) {
        omitidos++
        log.push(`Fila ${r.rowNumber}: serie «${serieNorm}» ya existe para ese producto, omitida.`)
        continue
      }

      const payload: Record<string, unknown> = {
        product_id: productId,
        serial_number: serieNorm,
        status: estadoSeguro(r.status),
        custody: r.custody,
        notes: r.notes,
      }
      if (r.referencePrice != null && r.referencePrice > 0) {
        payload.reference_price = r.referencePrice
        payload.reference_currency = r.referenceCurrency
      }

      const { error: insErr } = await supabase.from('inventory_items').insert(payload)
      if (insErr) {
        errores++
        log.push(`Fila ${r.rowNumber} («${serieNorm}»): error — ${insErr.message}`)
        continue
      }
      insertados++
    }

    log.unshift(
      `Listo: ${insertados} serie(s) cargada(s), ${omitidos} omitida(s), ${productosCreados} producto(s) nuevo(s) en catálogo, ${errores} error(es).`,
    )
    return { log, ok: errores === 0 && insertados > 0 }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { log: [`Error general: ${msg}`], ok: false }
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export default function InventoryExcelImportDialog({ open, onOpenChange, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [sheetName, setSheetName] = useState<string>('')

  const drafts = useMemo((): ExcelInventorySerialDraft[] => {
    if (!workbook || !sheetName) return []
    try {
      return parseInventorySerialRows(workbook.getSheetRows(sheetName))
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

  const importMutation = useMutation({
    mutationFn: (list: ExcelInventorySerialDraft[]) => importarFilasInventario(list),
  })

  const onPickFile = async (f: File | null) => {
    setFile(f)
    importMutation.reset()
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
      alert('No se pudo leer el libro. Use formato .xlsx o .xls.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[min(90vh,42rem)] flex flex-col gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-gray-500 shrink-0" size={18} />
            Importar inventario desde Excel
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-600 leading-relaxed text-left pt-1">
            Primera fila: <span className="font-medium text-gray-800">encabezados</span>. Una fila = una unidad con número de serie.
            Columnas reconocidas (flexibles):{' '}
            <span className="font-medium">producto</span> / nombre / modelo +{' '}
            <span className="font-medium">serie</span> / número de serie +{' '}
            <span className="font-medium">ubicación</span> / custodia (texto libre: bodega, cliente, vendido, préstamo, tránsito…){' '}
            + <span className="font-medium">nota</span> + <span className="font-medium">precio</span> (valor referencia){' '}
            + moneda (CLP, USD, UF) + <span className="font-medium">estado</span> opcional (disponible, reservado, vendido, dañado).
            Si el nombre del producto no existe en el catálogo, se crea un producto físico con precio lista 0 (luego podés editarlo).
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
              <strong className="text-gray-800">{drafts.length}</strong> filas reconocidas con producto y número de serie.
            </p>
          ) : workbook != null && sheetName !== '' ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shrink-0">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              No hay filas válidas: revisá que existan columnas de nombre de producto y de número de serie.
            </div>
          ) : null}

          {importMutation.isSuccess && importMutation.data?.log?.length !== undefined ? (
            <div
              className={cn(
                'rounded-lg border px-3 py-2 flex flex-col gap-1 min-h-0 flex-1 max-h-[12rem]',
                importMutation.data?.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
              )}
            >
              <div className="flex items-center gap-1 text-xs font-semibold text-gray-900 shrink-0">
                <CheckCircle2 size={13} />
                Bitácora
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
              disabled={drafts.length === 0 || importMutation.isPending}
              onClick={() =>
                importMutation.mutate(drafts, {
                  onSuccess: () => onImported?.(),
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
