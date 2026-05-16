/**
 * Valores por defecto del emisor / marca (sobreescritos por la fila `crm_app_settings` en Supabase
 * cuando el super_admin guarda en Administración → Organización).
 */
export const CRM_COMPANY_DEFAULTS = {
  displayName: 'CRM B2B',
  tagline: 'Panel de gestión',
  legalName: 'MCS',
  rut: '76.XXX.XXX-X',
  address: 'Dirección 123, Ciudad',
  phone: '+56 9 XXXX XXXX',
  email: 'contacto@tuempresa.cl',
  website: 'www.tuempresa.cl',
} as const

/** Compatibilidad con impresión de cotización (bloque emisor). */
export const COMPANY = {
  name: CRM_COMPANY_DEFAULTS.legalName,
  rut: CRM_COMPANY_DEFAULTS.rut,
  address: CRM_COMPANY_DEFAULTS.address,
  phone: CRM_COMPANY_DEFAULTS.phone,
  email: CRM_COMPANY_DEFAULTS.email,
  website: CRM_COMPANY_DEFAULTS.website,
}
