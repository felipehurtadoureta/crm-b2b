export type Role = 'super_admin' | 'kam' | 'reader'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  phone?: string
  avatar_url?: string
  /** Abreviatura en listados (ej. FHU); si es null se usan iniciales del nombre */
  display_abbr?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  name: string
  rut?: string
  industry?: string
  website?: string
  address?: string
  city?: string
  country: string
  phone?: string
  primary_contact_id?: string
  status: 'activo' | 'inactivo' | 'potencial'
  notes?: string
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  company_id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  position?: string
  department?: string
  is_primary: boolean
  notes?: string
  created_at: string
  updated_at: string
  is_active: boolean
}

export interface Call {
  id: string
  company_id: string
  contact_id?: string
  kam_id: string
  deal_id?: string
  quote_id?: string
  called_at: string
  outcome: 'sin_resultado' | 'interesado' | 'no_interesado' | 'requiere_seguimiento' | 'cotizacion_solicitada' | 'venta_cerrada'
  notes?: string
  next_contact_date?: string
  created_at: string
  updated_at: string
  type: 'llamada' | 'whatsapp' | 'email' | 'reunion' | 'visita'
}

export interface Activity {
  id: string
  company_id: string
  contact_id?: string
  kam_id: string
  call_id?: string
  deal_id?: string
  type: 'tarea' | 'reunion' | 'seguimiento' | 'llamada' | 'email'
  title: string
  description?: string
  due_date?: string
  status: 'pendiente' | 'en_progreso' | 'completada' | 'cancelada'
  auto_generated: boolean
  created_at: string
  updated_at: string
}

// ── Módulo interacciones v2 (tablas `interactions` y `tasks` en Supabase) ──

/** Tipos permitidos en columna `interactions.type` */
export type InteractionType =
  | 'call'
  | 'meeting'
  | 'email'
  | 'whatsapp'
  | 'follow_up'
  | 'presentation'
  | 'note'
  | 'visit'
  | 'quote_sent'
  | 'quote_update'
  | 'quote_approved'
  | 'quote_rejected'
  | 'reminder'

/** Resultados permitidos en columna `interactions.outcome` */
export type InteractionOutcome =
  | 'interested'
  | 'not_interested'
  | 'pending'
  | 'follow_up_later'
  | 'meeting_scheduled'
  | 'send_information'
  | 'quote_sent'
  | 'quote_under_review'
  | 'quote_approved'
  | 'quote_rejected'
  | 'no_response'

export interface Interaction {
  id: string
  company_id: string
  contact_id: string | null
  quote_id: string | null
  type: InteractionType
  title: string
  notes: string | null
  outcome: InteractionOutcome | null
  next_step: string | null
  interaction_date: string
  created_by: string
  created_at: string
  updated_at: string
}

/** Payload para insertar (el trigger puede rellenar `created_by` con `auth.uid()`). */
export type InteractionInsert = {
  company_id: string
  contact_id?: string | null
  quote_id?: string | null
  type: InteractionType
  title: string
  notes?: string | null
  outcome?: InteractionOutcome | null
  next_step?: string | null
  interaction_date?: string
  created_by?: string | null
}

export type CrmTaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type CrmTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

/** Fila de la tabla `tasks` (evitamos el nombre `Task` por colisión con tipos del DOM). */
export interface CrmTask {
  id: string
  company_id: string
  contact_id: string | null
  interaction_id: string | null
  quote_id: string | null
  assigned_to: string
  title: string
  description: string | null
  due_date: string
  priority: CrmTaskPriority
  status: CrmTaskStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type CrmTaskInsert = {
  company_id: string
  contact_id?: string | null
  interaction_id?: string | null
  quote_id?: string | null
  assigned_to: string
  title: string
  description?: string | null
  due_date: string
  priority?: CrmTaskPriority
  status?: CrmTaskStatus
}

export type CrmTaskUpdate = Partial<
  Pick<
    CrmTask,
    | 'title'
    | 'description'
    | 'due_date'
    | 'priority'
    | 'status'
    | 'completed_at'
    | 'assigned_to'
    | 'contact_id'
    | 'quote_id'
    | 'interaction_id'
  >
>

// ── Seguimientos comerciales (tablas `commercial_followups`, `commercial_followup_reminders`, `invoices`) ──

export type CommercialFollowupSubject = 'company' | 'quote' | 'invoice'

export type CommercialFollowupImportance = 'baja' | 'media' | 'alta'

/** Medio del próximo contacto programado en agenda (Reunión, Mail, Llamado). */
export type CommercialFollowupNextChannel = 'reunion' | 'mail' | 'llamado'

export type CommercialFollowupReminderStatus = 'open' | 'superseded' | 'cancelled'

export type CommercialFollowupReminderClosedReason =
  | 'new_followup'
  | 'manual'
  | 'quote_closed'
  | 'invoice_paid'
  | 'invoice_cancelled'

export interface CommercialFollowup {
  id: string
  company_id: string
  subject_type: CommercialFollowupSubject
  quote_id: string | null
  invoice_id: string | null
  contact_id: string | null
  created_by: string
  followed_at: string
  body: string
  next_follow_up_at: string | null
  /** Tipo de próximo contacto (visible en agenda). */
  next_follow_up_kind: CommercialFollowupNextChannel | null
  /** Prioridad del evento (impacto en agenda si es alta). */
  importance: CommercialFollowupImportance
  created_at: string
  updated_at: string
}

export interface CommercialFollowupReminder {
  id: string
  company_id: string
  subject_type: CommercialFollowupSubject
  quote_id: string | null
  invoice_id: string | null
  due_date: string
  /** Reunión / Mail / Llamado (copiado del seguimiento que abrió el recordatorio). */
  next_follow_up_kind: CommercialFollowupNextChannel | null
  status: CommercialFollowupReminderStatus
  source_followup_id: string | null
  /** Copiada del seguimiento que generó este recordatorio. */
  importance: CommercialFollowupImportance
  closed_at: string | null
  closed_reason: CommercialFollowupReminderClosedReason | null
  created_at: string
  updated_at: string
}

export type InvoiceStatus = 'borrador' | 'pendiente' | 'pagada' | 'anulada' | 'nota_credito'

export interface Invoice {
  id: string
  company_id: string
  quote_id: string | null
  /** Enlace técnico a documento de ventas SII (RCV) cuando aplica. */
  sii_sales_document_id?: string | null
  invoice_number: string
  title: string | null
  status: InvoiceStatus
  total: number
  currency: string
  paid_at: string | null
  sii_validated_at?: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Cuenta bancaria registrada al importar cartola (tabla `bank_accounts`). */
export interface BankAccount {
  id: string
  bank_name: string
  account_number: string
  account_label: string | null
  holder_name: string | null
  holder_rut: string | null
  currency: string
  created_at: string
  updated_at: string
}

/** Movimiento de cartola (tabla `bank_transactions`). */
export interface BankTransaction {
  id: string
  bank_account_id: string
  movement_date: string
  description: string
  debit: number
  credit: number
  balance: number | null
  document_number: string | null
  trn: string | null
  branch: string | null
  invoice_id: string | null
  sii_purchase_document_id: string | null
  sii_sales_document_id: string | null
  glosa: string | null
  notes: string | null
  import_hash: string
  raw: Record<string, unknown> | null
  imported_by: string | null
  created_at: string
  updated_at: string
}

/** Conexión a contribuyente SII (tabla `sii_connections`). */
/** Integración SII: solo importación manual desde archivos del portal. */
export type SiiProvider = 'direct'

export interface SiiConnection {
  id: string
  rut: string
  legal_name: string
  provider: SiiProvider
  is_active: boolean
  initial_sync_months: number
  last_sync_at: string | null
  last_sync_compras_at: string | null
  last_sync_ventas_at: string | null
  last_sync_honorarios_at: string | null
  created_at: string
  updated_at: string
}

/** RCV compra — tabla `sii_purchase_documents`. */
export interface SiiPurchaseDocument {
  id: string
  connection_id: string
  periodo: string
  tipo_dte: string
  folio: string
  fecha_emision: string
  rut_emisor: string
  razon_social_emisor: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  estado_rcv: string | null
  company_id: string | null
  sii_import_hash: string
  raw?: Record<string, unknown> | null
  synced_at: string
  created_at: string
  updated_at: string
}

/** RCV venta — tabla `sii_sales_documents`. */
export interface SiiSalesDocument {
  id: string
  connection_id: string
  periodo: string
  tipo_dte: string
  folio: string
  fecha_emision: string
  rut_receptor: string
  razon_social_receptor: string
  monto_neto: number
  monto_iva: number
  monto_total: number
  estado_rcv: string | null
  company_id: string | null
  sii_import_hash: string
  raw?: Record<string, unknown> | null
  synced_at: string
  created_at: string
  updated_at: string
}

/** Boleta honorarios — tabla `sii_honorarium_receipts`. */
export type SiiHonorariumType = 'BHE' | 'BTE'

export interface SiiHonorariumReceipt {
  id: string
  connection_id: string
  periodo: string
  numero_boleta: string
  fecha: string
  rut_prestador: string
  rut_receptor: string
  nombre_prestador: string
  monto_bruto: number
  retencion: number
  liquido: number
  estado: string | null
  tipo_boleta: SiiHonorariumType
  company_id: string | null
  sii_import_hash: string
  synced_at: string
  created_at: string
  updated_at: string
}

/** Tipo de fila en `products` (UI usa `product` e `inventory` como físico con stock). */
export type ProductType = 'product' | 'service' | 'inventory'

export type ProductCurrency = 'CLP' | 'USD' | 'UF'

/** Alias para formularios de producto / cotización */
export type Currency = ProductCurrency

export interface Product {
  id: string
  name: string
  sku?: string
  description?: string
  type: ProductType
  /** Solo aplica a tipo físico (`product` o `inventory`); puede faltar en filas antiguas */
  has_inventory?: boolean
  service_category?: string | null
  price: number
  currency: ProductCurrency
  tax_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductPriceHistory {
  id: string
  product_id: string
  old_price: number
  new_price: number
  currency: string
  changed_at: string
  changed_by?: string | null
  new_currency?: string | null
}

/** Custodia física/comercial del ítem serializado (v2 inventario). */
export type InventoryCustody = 'bodega' | 'en_cliente' | 'prestamo' | 'transito'

export interface InventoryItem {
  id: string
  product_id: string
  serial_number: string
  status: string
  notes?: string | null
  destination_notes?: string | null
  installed_address?: string | null
  /** Dónde está la unidad (bodega, cliente, préstamo, etc.) */
  custody?: InventoryCustody | string
  reference_price?: number | null
  reference_currency?: ProductCurrency | string | null
  custody_company_id?: string | null
  created_at?: string
  updated_at?: string
}

/** Naturaleza de la línea en cotización v2. */
export type QuoteLineKind = 'stock' | 'procure' | 'service' | 'custom'

/** Modalidad económica por línea (mezcla venta y arriendo en un mismo documento). */
export type QuotePricingModel = 'sale' | 'monthly_rental'

/** Si la línea es abastecimiento externo (procure). */
export type QuoteProcurementPlan = 'manufacture' | 'purchase'

export type DealStage =
  | 'nuevo'
  | 'en_negociacion'
  | 'propuesta_enviada'
  | 'ganado'
  | 'perdido'

export interface Deal {
  id: string
  title: string
  company_id: string
  contact_id?: string | null
  kam_id: string
  stage: DealStage
  probability: number
  expected_value?: number | null
  currency: 'CLP' | 'USD'
  expected_close?: string | null
  description?: string | null
  lost_reason?: string | null
  closed_at?: string | null
  created_at: string
  updated_at: string
}

export type QuoteStage =
  | 'borrador'
  | 'en_negociacion'
  | 'enviada'
  | 'aceptada'
  | 'pendiente_facturar'
  | 'rechazada'
  | 'facturada'

/** Etapas de cotización que cierran el hilo de seguimiento en cotización. */
export const QUOTE_FOLLOWUP_CLOSED_STAGES: readonly QuoteStage[] = [
  'aceptada',
  'rechazada',
  'facturada',
] as const

/** Compatibilidad con datos previos a renombrar la etapa. */
export function normalizeQuoteStage(stage: string): QuoteStage {
  if (stage === 'orden_de_venta') return 'facturada'
  return stage as QuoteStage
}

/** Etapa mostrada en Kanban (mantiene etapa real). */
export function quoteKanbanStage(stage: string): QuoteStage {
  return normalizeQuoteStage(stage)
}

export interface Quote {
  id: string
  company_id: string
  contact_id?: string
  kam_id: string
  call_id?: string
  quote_number: string
  title?: string
  stage: QuoteStage
  probability: number
  currency: 'CLP' | 'USD' | 'UF'
  subtotal: number
  tax_amount: number
  total: number
  valid_until?: string
  expected_close?: string
  notes?: string
  lost_reason?: string
  closed_at?: string
  /** Día del mes (1–28) para alertar facturación de arriendo mensual */
  rental_billing_day?: number | null
  /** Último período mensual facturado (YYYY-MM) */
  rental_last_billed_period?: string | null
  sent_at?: string
  responded_at?: string
  is_tax_exempt?: boolean
  discount_type?: string
  discount_value?: number
  discount_amount?: number
  usd_clp_rate?: number
  uf_clp_rate?: number
  exchange_rate_date?: string
  created_at: string
  updated_at: string
}

export type CompanyDocumentCategory = 'contrato' | 'orden_compra' | 'factura' | 'otro'

export interface CompanyDocument {
  id: string
  company_id: string
  /** Cotización vinculada (opcional); requiere columna `quote_id` en Supabase */
  quote_id?: string | null
  /** Factura vinculada (opcional); requiere columna `invoice_id` y exclusión con quote_id */
  invoice_id?: string | null
  storage_path: string
  file_name: string
  mime_type: string | null
  category: CompanyDocumentCategory
  uploaded_by: string | null
  notes: string | null
  created_at: string
}

export interface QuoteItem {
  id: string
  quote_id: string
  product_id?: string
  product_name: string
  product_currency?: string
  quantity: number
  unit_price: number
  subtotal: number
  line_kind?: QuoteLineKind
  pricing_model?: QuotePricingModel
  procurement_plan?: QuoteProcurementPlan | null
  inventory_item_id?: string | null
}