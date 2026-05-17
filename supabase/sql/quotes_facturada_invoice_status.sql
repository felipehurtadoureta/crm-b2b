-- Cotización: etapa orden_de_venta → facturada
-- Facturas: estado nota_credito + validación SII

update public.quotes
set stage = 'facturada'
where stage = 'orden_de_venta';

alter table public.invoices
  add column if not exists sii_validated_at timestamptz;

comment on column public.invoices.sii_validated_at is
  'Fecha en que se validó el número de factura del SII en el CRM.';

-- Ampliar estados de factura (mantener borrador/anulada por compatibilidad)
alter table public.invoices drop constraint if exists invoices_status_check;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('borrador', 'pendiente', 'pagada', 'anulada', 'nota_credito'));
