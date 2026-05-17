/**
 * Nota editable por movimiento (guarda al salir del campo).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateTransactionNotes } from '@/lib/bankBookQuery'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Props {
  transactionId: string
  value: string | null
  disabled?: boolean
}

export default function BankTransactionNoteInput({
  transactionId,
  value,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient()
  const [local, setLocal] = useState(value ?? '')

  useEffect(() => {
    setLocal(value ?? '')
  }, [value, transactionId])

  const mutation = useMutation({
    mutationFn: (notes: string | null) => updateTransactionNotes(transactionId, notes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
    },
    onError: (e: Error) => alert(e.message),
  })

  const commit = () => {
    const trimmed = local.trim()
    const next = trimmed || null
    if (next === (value?.trim() || null)) return
    mutation.mutate(next)
  }

  return (
    <Textarea
      value={local}
      disabled={disabled || mutation.isPending}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      placeholder="Agregar nota…"
      rows={2}
      className={cn(
        'min-h-[2.25rem] text-xs resize-y max-w-xs',
        mutation.isPending && 'opacity-60',
      )}
    />
  )
}
