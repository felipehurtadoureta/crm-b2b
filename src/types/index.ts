export type Role = 'super_admin' | 'kam' | 'reader'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  phone?: string
  avatar_url?: string
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

export interface Product {
  id: string
  name: string
  sku?: string
  description?: string
  type: 'inventory' | 'service'
  price: number
  currency: 'CLP' | 'USD'
  tax_rate: number
  is_active: boolean
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

export interface QuoteItem {
  id: string
  quote_id: string
  product_id?: string
  product_name: string
  product_currency?: string
  quantity: number
  unit_price: number
  subtotal: number
}