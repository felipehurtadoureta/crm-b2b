-- Etapa intermedia: cotización aceptada para facturar en SII, pendiente de vincular folio.
-- Ejecutar en Supabase SQL Editor después de quotes_stage_facturada_check.sql.

alter table public.quotes drop constraint if exists quotes_stage_check;

alter table public.quotes
  add constraint quotes_stage_check
  check (
    stage in (
      'borrador',
      'en_negociacion',
      'enviada',
      'aceptada',
      'pendiente_facturar',
      'rechazada',
      'facturada',
      'orden_de_venta'
    )
  );
