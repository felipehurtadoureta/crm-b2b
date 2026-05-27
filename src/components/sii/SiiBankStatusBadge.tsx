/**
 * Badge de pago/cobro según movimientos FC/FV del libro de banco.
 */
import { cn } from '@/lib/utils'

export type SiiBankStatusTone = 'paid' | 'partial' | 'pending'

type Props = {
  label: string
  tone: SiiBankStatusTone
  /** Compras: pago; ventas: cobro */
  mode: 'pago' | 'cobro'
}

export default function SiiBankStatusBadge({ label, tone, mode }: Props) {
  if (tone === 'pending' && label.startsWith('Pendiente')) {
    return <span className="text-xs text-gray-400">—</span>
  }

  return (
    <span
      className={cn(
        'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap',
        tone === 'paid' && 'bg-green-100 text-green-800',
        tone === 'partial' && 'bg-amber-100 text-amber-900',
        tone === 'pending' && 'bg-gray-100 text-gray-600',
      )}
      title={
        mode === 'pago'
          ? 'Estado de pago en libro de banco (glosa FC)'
          : 'Estado de cobro en libro de banco (glosa FV)'
      }
    >
      {label}
    </span>
  )
}
