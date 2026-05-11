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

export interface Deal {
  id: string
  company_id: string
  contact_id?: string
  kam_id: string
  title: string
  description?: string
  stage: 'nuevo' | 'en_negociacion' | 'propuesta_enviada' | 'ganado' | 'perdido'
  probability: number
  expected_value?: number
  currency: 'CLP' | 'USD'
  expected_close?: string
  closed_at?: string
  lost_reason?: string
  created_at: string
  updated_at: string
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

export interface Quote {
  id: string
  company_id: string
  contact_id?: string
  kam_id: string
  call_id?: string
  deal_id?: string
  quote_number: string
  status: 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'orden_de_venta'
  currency: 'CLP' | 'USD' | 'UF'
  close_probability: number
  subtotal: number
  tax_amount: number
  total: number
  valid_until?: string
  notes?: string
  sent_at?: string
  responded_at?: string
  created_at: string
  updated_at: string
}

export interface SalesOrder {
  id: string
  quote_id?: string
  company_id: string
  contact_id?: string
  kam_id: string
  order_number: string
  status: 'pendiente' | 'confirmada' | 'entregada' | 'cancelada'
  currency: 'CLP' | 'USD'
  subtotal: number
  tax_amount: number
  total: number
  notes?: string
  confirmed_at?: string
  delivered_at?: string
  created_at: string
  updated_at: string
}

export interface SalesOrderItem {
  id: string
  sales_order_id: string
  product_id?: string
  inventory_item_id?: string
  product_name: string
  serial_number?: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_pct: number
  line_subtotal: number
  line_tax: number
  line_total: number
  created_at: string
}