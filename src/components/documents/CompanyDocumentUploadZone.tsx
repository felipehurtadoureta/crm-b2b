/**
 * Zona unificada de carga: elegir archivos, arrastrar y pegar (Ctrl+V).
 * Usada en ficha empresa, módulo Documentos y cotización.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  COMPANY_DOCUMENT_ACCEPT_INPUT,
  MAX_COMPANY_DOCUMENT_BYTES,
} from '@/lib/companyDocumentsUpload'
import { cn } from '@/lib/utils'
import { Upload } from 'lucide-react'

function filesFromList(list: FileList | File[] | null | undefined): File[] {
  if (!list) return []
  return Array.from(list as Iterable<File>)
}

export interface CompanyDocumentUploadZoneProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
  isUploading?: boolean
  density?: 'default' | 'compact'
  className?: string
  /** Selectores (destino, categoría, etc.) entre la ayuda y el botón. */
  controls?: ReactNode
  buttonLabel?: string
  hint?: string
}

export default function CompanyDocumentUploadZone({
  onFiles,
  disabled = false,
  isUploading = false,
  density = 'default',
  className,
  controls,
  buttonLabel = 'Archivos',
  hint,
}: CompanyDocumentUploadZoneProps) {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  const blocked = disabled || isUploading
  const compact = density === 'compact'

  const deliverFiles = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = filesFromList(list)
      if (!files.length || blocked) return
      onFiles(files)
    },
    [blocked, onFiles],
  )

  const openFilePicker = useCallback(() => {
    if (blocked) return
    fileInputRef.current?.click()
  }, [blocked])

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    deliverFiles(e.target.files)
    e.target.value = ''
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (blocked) return
    dragDepth.current += 1
    if (e.dataTransfer.types.includes('Files')) setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (blocked) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!blocked && e.dataTransfer.types.includes('Files')) e.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragActive(false)
    if (blocked) return
    deliverFiles(e.dataTransfer.files)
  }

  const handlePaste = useCallback(
    (e: ClipboardEvent | React.ClipboardEvent) => {
      if (blocked) return
      const files = filesFromList(e.clipboardData?.files ?? null)
      if (!files.length) return
      e.preventDefault()
      deliverFiles(files)
    },
    [blocked, deliverFiles],
  )

  useEffect(() => {
    const el = zoneRef.current
    if (!el || blocked) return
    el.addEventListener('paste', handlePaste as EventListener)
    return () => el.removeEventListener('paste', handlePaste as EventListener)
  }, [blocked, handlePaste])

  const defaultHint = dragActive
    ? 'Suelte aquí para cargar'
    : 'Arrastre, pegue (Ctrl+V) o use el botón'

  return (
    <>
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        className="sr-only"
        style={{ position: 'fixed', left: -9999, top: 0, width: 1, height: 1 }}
        accept={COMPANY_DOCUMENT_ACCEPT_INPUT}
        multiple
        disabled={blocked}
        onChange={onInputChange}
      />
      <div
        ref={zoneRef}
        tabIndex={blocked ? -1 : 0}
        role="region"
        aria-label="Zona para subir documentos"
        className={cn(
          'rounded-lg border-2 border-dashed transition-colors outline-none',
          'flex flex-col gap-1.5 text-left min-w-0',
          'focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1',
          dragActive ? 'border-blue-500 bg-blue-50/90' : 'border-gray-200 bg-gray-50/80',
          blocked && 'opacity-70',
          className,
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-600">
          <Upload className={cn('text-gray-400 shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
          <span className="font-medium text-gray-800">{hint ?? defaultHint}</span>
          <span className="hidden sm:inline text-gray-300">·</span>
          <span className="text-[10px] text-gray-500 shrink-0">
            Máx. {MAX_COMPANY_DOCUMENT_BYTES / (1024 * 1024)} MB c/u · PDF, Office, imágenes, TXT/CSV
          </span>
        </div>

        {controls}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('text-xs gap-1.5 shrink-0', compact ? 'h-7 px-2' : 'h-8 px-2.5')}
            disabled={blocked}
            onClick={e => {
              e.stopPropagation()
              openFilePicker()
            }}
          >
            <Upload size={13} />
            {isUploading ? 'Subiendo…' : buttonLabel}
          </Button>
        </div>
      </div>
    </>
  )
}
