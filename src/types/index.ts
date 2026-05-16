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
  status: CommercialFollowupReminderStatus
  source_followup_id: string | null
  /** Copiada del seguimiento que generó este recordatorio. */
  importance: CommercialFollowupImportance
  closed_at: string | null
  closed_reason: CommercialFollowupReminderClosedReason | null
  created_at: string
  updated_at: string
}

export type InvoiceStatus = 'borrador' | 'pendiente' | 'pagada' | 'anulada'

export interface Invoice {
  id: string
  company_id: string
  quote_id: string | null
  invoice_number: string
  title: string | null
  status: InvoiceStatus
  total: number
  currency: string
  paid_at: string | null
  notes: string | null
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
  | 'rechazada'
  | 'orden_de_venta'

/** Etapas de cotización que cierran el hilo de seguimiento en cotización. */
export const QUOTE_FOLLOWUP_CLOSED_STAGES: readonly QuoteStage[] = [
  'aceptada',
  'rechazada',
  'orden_de_venta',
] as const

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