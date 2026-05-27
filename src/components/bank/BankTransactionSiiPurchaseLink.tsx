/**
 * Vincular movimiento con glosa FC a una factura de compra del RCV SII.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  computeSiiPurchasePaymentStatus,
  formatSiiPurchaseShort,
  searchSiiPurchasesForBankLink,
  updateTransactionSiiPurchaseLink,
  type BankSiiPurchaseContext,
} from '@/lib/bankSiiPurchaseLink'
import type { SiiPurchaseDocument } from '@/types'
import { cn } from '@/lib/utils'

const fmtClp = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es-CL') : '—')

type Props = {
  transactionId: string
  glosa: string | null
  siiPurchaseDocumentId: string | null
  /** Cargo bancario del movimiento (para sugerir factura por monto). */
  amount: number
  paymentContext?: BankSiiPurchaseContext
  canEdit: boolean
}

export default function BankTransactionSiiPurchaseLink({
  transactionId,
  glosa,
  siiPurchaseDocumentId,
  amount,
  paymentContext,
  canEdit,
}: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const isFc = glosa === 'FC'

  const searchQ = useQuery({
    queryKey: ['sii-purchases-bank-link', search, amount],
    queryFn: () => searchSiiPurchasesForBankLink(search, { amount }),
    enabled: open,
  })

  const linkMut = useMutation({
    mutationFn: (docId: string | null) => updateTransactionSiiPurchaseLink(transactionId, docId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bank-transactions'] })
      void qc.invalidateQueries({ queryKey: ['bank-sii-purchase-payments'] })
      void qc.invalidateQueries({ queryKey: ['sii-document-purchase-payments'] })
      setOpen(false)
    },
    onError: (e: Error) => alert(e.message),
  })

  if (!isFc) {
    return <span className="text-xs text-gray-400">—</span>
  }

  const doc = siiPurchaseDocumentId ? paymentContext?.documents.get(siiPurchaseDocumentId) : undefined
  const paid = siiPurchaseDocumentId ? (paymentContext?.paidByDocumentId.get(siiPurchaseDocumentId) ?? 0) : 0
  const status = doc ? computeSiiPurchasePaymentStatus(Number(doc.monto_total), paid) : null

  return (
    <div className="space-y-1 min-w-[12rem]">
      {doc ? (
        <>
          <p className="text-xs font-medium text-gray-800 leading-snug" title={formatSiiPurchaseShort(doc)}>
            {formatSiiPurchaseShort(doc)}
          </p>
          <p className="text-[10px] text-gray-500">
            {fmtDate(doc.fecha_emision)} · {fmtClp(Number(doc.monto_total))}
          </p>
          {status && (
            <span
              className={cn(
                'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded',
                status.tone === 'paid' && 'bg-green-100 text-green-800',
                status.tone === 'partial' && 'bg-amber-100 text-amber-900',
                status.tone === 'pending' && 'bg-gray-100 text-gray-700',
              )}
            >
              {status.label}
            </span>
          )}
          <div className="flex flex-wrap gap-2 pt-0.5">
            {canEdit && (
              <button
                type="button"
                className="text-[10px] text-blue-600 hover:underline"
                onClick={() => setOpen(true)}
              >
                Cambiar
              </button>
            )}
            <Link to="/sii" className="text-[10px] text-blue-600 hover:underline">
              Ver en SII
            </Link>
          </div>
        </>
      ) : canEdit ? (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setOpen(true)}>
          <Link2 size={12} />
          Vincular factura SII
        </Button>
      ) : (
        <span className="text-xs text-gray-400">Sin vincular</span>
      )}

      <SiiPurchaseLinkDialog
        open={open}
        onOpenChange={setOpen}
        search={search}
        onSearchChange={setSearch}
        amount={amount}
        results={searchQ.data ?? []}
        loading={searchQ.isLoading}
        pending={linkMut.isPending}
        onSelect={id => linkMut.mutate(id)}
        onClear={() => linkMut.mutate(null)}
        hasLink={Boolean(siiPurchaseDocumentId)}
      />
    </div>
  )
}

function SiiPurchaseLinkDialog({
  open,
  onOpenChange,
  search,
  onSearchChange,
  amount,
  results,
  loading,
  pending,
  onSelect,
  onClear,
  hasLink,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  search: string
  onSearchChange: (v: string) => void
  amount: number
  results: SiiPurchaseDocument[]
  loading: boolean
  pending: boolean
  onSelect: (id: string) => void
  onClear: () => void
  hasLink: boolean
}) {
  useEffect(() => {
    if (!open) onSearchChange('')
  }, [open, onSearchChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vincular factura de compra (SII)</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-600">
          Busque por folio, RUT o proveedor. La primera opción es la factura con monto más parecido al cargo (
          {fmtClp(amount)}).
        </p>

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
          <Input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Ej. folio 1234, RUT proveedor…"
            className="pl-8 h-9 text-sm"
          />
        </div>

        {loading && <p className="text-xs text-gray-500">Buscando…</p>}

        {!loading && results.length === 0 && (
          <p className="text-xs text-gray-500 py-4 text-center">Sin resultados. Importe compras en SII (RCV) primero.</p>
        )}

        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {results.map((doc, index) => (
            <li key={doc.id}>
              <button
                type="button"
                disabled={pending}
                className={cn(
                  'w-full text-left rounded-md border px-3 py-2 text-xs hover:bg-gray-50',
                  index === 0 && amount > 0 && !search.trim()
                    ? 'border-blue-200 bg-blue-50/50'
                    : 'border-gray-100',
                )}
                onClick={() => onSelect(doc.id)}
              >
                <span className="font-medium flex items-center gap-1.5 flex-wrap">
                  {formatSiiPurchaseShort(doc)}
                  {index === 0 && amount > 0 && !search.trim() && (
                    <span className="text-[10px] font-normal text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                      Sugerida
                    </span>
                  )}
                </span>
                <span className="block text-gray-500 mt-0.5">
                  {fmtDate(doc.fecha_emision)} · {fmtClp(Number(doc.monto_total))}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2">
          {hasLink && (
            <Button type="button" variant="outline" disabled={pending} onClick={onClear}>
              Quitar vínculo
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
