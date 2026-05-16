/**
 * Campo de monto con separador de miles al perder foco (es-CL / US).
 */
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function formatDisplay(n: number, cur: string): string {
  if (!Number.isFinite(n) || n === 0) return ''
  if (cur === 'CLP') return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n))
  if (cur === 'USD') {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  }
  return new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

function parseTyped(raw: string, cur: string): number {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return 0
  if (cur === 'CLP') {
    const digits = s.replace(/\./g, '').replace(/,/g, '')
    return Math.max(0, Math.round(Number(digits) || 0))
  }
  const normalized = s.includes(',') && !s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  return Math.max(0, parseFloat(normalized) || 0)
}

interface Props {
  value: number
  currency: string
  onChange: (n: number) => void
  disabled?: boolean
  className?: string
  min?: number
}

export default function QuoteAmountInput({ value, currency, onChange, disabled, className, min = 0 }: Props) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!focused) setText(value > 0 || value === 0 ? formatDisplay(value, currency) : '')
  }, [value, currency, focused])

  return (
    <Input
      type="text"
      inputMode={currency === 'CLP' ? 'numeric' : 'decimal'}
      disabled={disabled}
      className={cn('tabular-nums', className)}
      value={focused ? text : formatDisplay(value, currency)}
      onFocus={() => {
        setFocused(true)
        setText(value ? String(value) : '')
      }}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        const n = parseTyped(text, currency)
        onChange(Math.max(min, n))
      }}
    />
  )
}
