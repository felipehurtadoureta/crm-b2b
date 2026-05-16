/**
 * Resultados de interacción: mismos valores que la columna calls.outcome en Supabase.
 * Textos distintos según contexto (prospección vs seguimiento a una cotización ya enviada).
 */
export const OUTCOMES_PROSPECTION: { value: string; label: string }[] = [
  { value: 'sin_resultado', label: 'Sin resultado' },
  { value: 'interesado', label: 'Interesado' },
  { value: 'no_interesado', label: 'No interesado' },
  { value: 'requiere_seguimiento', label: 'Requiere seguimiento' },
  { value: 'cotizacion_solicitada', label: 'Cotización solicitada' },
  { value: 'venta_cerrada', label: 'Venta cerrada' },
]

/** Seguimiento post-envío de propuesta (misma columna outcome; etiquetas alineadas al negocio). */
export const OUTCOMES_QUOTE_FOLLOWUP: { value: string; label: string }[] = [
  { value: 'sin_resultado', label: 'Solo registro / sin definición aún' },
  { value: 'interesado', label: 'Cliente sigue evaluando o avanza de forma positiva' },
  { value: 'no_interesado', label: 'No acepta esta propuesta (rechazo)' },
  { value: 'requiere_seguimiento', label: 'Sin respuesta o hay que insistir más adelante' },
  { value: 'cotizacion_solicitada', label: 'Pide cambios, precio distinto o nueva versión' },
  { value: 'venta_cerrada', label: 'Acepta, compra u orden (cierre a favor)' },
]

/** Etiqueta corta del resultado para listados (agenda, pendientes). */
export function callOutcomeLabel(outcome: string | null | undefined, quoteFollowup: boolean): string {
  const v = outcome ?? 'sin_resultado'
  const list = quoteFollowup ? OUTCOMES_QUOTE_FOLLOWUP : OUTCOMES_PROSPECTION
  return list.find(o => o.value === v)?.label ?? v
}

/** Fecha YYYY-MM-DD dentro de N días desde hoy (local). */
export function addDaysToTodayIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
