/**
 * Selector de glosa por movimiento (catálogo manual).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BANK_GLOSAS_QUERY_KEY, bankGlosaLabel, fetchBankGlosas } from '@/lib/bankGlosas'
import { updateTransactionGlosa } from '@/lib/bankBookQuery'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

interface Props {
  transactionId: string
  value: string | null
  disabled?: boolean
}

export default function BankTransactionGlosaSelect({
  transactionId,
  value,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient()

  const glosasQ = useQuery({
    queryKey: BANK_GLOSAS_QUERY_KEY,
    queryFn: () => fetchBankGlosas({ activeOnly: true }),
  })

  const glosas = glosasQ.data ?? []

  const mutation = useMutation({
    mutationFn: (glosa: string | null) => updateTransactionGlosa(transactionId, glosa),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
    },
    onError: (e: Error) => alert(e.message),
  })

  return (
    <Select
      value={value ?? NONE}
      disabled={disabled || mutation.isPending || glosasQ.isLoading}
      onValueChange={v => mutation.mutate(v === NONE ? null : v)}
    >
      <SelectTrigger className="h-8 w-full max-w-[11rem] text-xs">
        <SelectValue placeholder="Glosa">
          {value ? bankGlosaLabel(value) : '—'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {glosas.map(g => (
          <SelectItem key={g.id} value={g.code}>
            {g.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
