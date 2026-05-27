/**
 * Facturación recurrente de cotizaciones con líneas en arriendo mensual.
 */
import { supabase } from '@/lib/supabase'
import type { QuotePricingModel } from '@/types'

export const RENTAL_BILLING_DAY_MIN = 1
export const RENTAL_BILLING_DAY_MAX = 28

/** Período actual YYYY-MM (UTC fecha local del navegador). */
export function currentBillingPeriod(ref = new Date()): string {
  const y = ref.getFullYear()
  const m = String(ref.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Fecha de alerta YYYY-MM-DD para un período y día del mes. */
export function rentalAlertDate(period: string, billingDay: number): string {
  const day = String(Math.min(RENTAL_BILLING_DAY_MAX, Math.max(RENTAL_BILLING_DAY_MIN, billingDay))).padStart(2, '0')
  return `${period}-${day}`
}

export function isRentalPeriodBilled(
  lastBilled: string | null | undefined,
  period: string,
): boolean {
  if (!lastBilled?.trim()) return false
  return lastBilled.trim() >= period
}

/** ¿Debe aparecer pendiente de facturar mensualidad este mes? */
export function shouldShowRentalAlert(opts: {
  billingDay: number | null | undefined
  lastBilled: string | null | undefined
  hoyStr: string
  period?: string
}): boolean {
  const day = opts.billingDay
  if (day == null || day < RENTAL_BILLING_DAY_MIN || day > RENTAL_BILLING_DAY_MAX) return false
  const period = opts.period ?? opts.hoyStr.slice(0, 7)
  if (isRentalPeriodBilled(opts.lastBilled, period)) return false
  const alertDate = rentalAlertDate(period, day)
  return opts.hoyStr >= alertDate
}

export function formatBillingPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) return period
  const d = new Date(y, m - 1, 1)
  const label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function sumMonthlyRentalSubtotals(
  items: { pricing_model?: QuotePricingModel | null; subtotal?: number | null }[],
): number {
  return items
    .filter(i => i.pricing_model === 'monthly_rental')
    .reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0)
}

export async function updateQuoteRentalBillingDay(
  quoteId: string,
  day: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({ rental_billing_day: day })
    .eq('id', quoteId)
  if (error) throw new Error(error.message)
}

/** Marca el período indicado (por defecto el mes actual) como mensualidad facturada. */
export async function markQuoteRentalPeriodBilled(
  quoteId: string,
  period?: string,
): Promise<void> {
  const p = period ?? currentBillingPeriod()
  const { error } = await supabase
    .from('quotes')
    .update({ rental_last_billed_period: p })
    .eq('id', quoteId)
  if (error) throw new Error(error.message)
}
