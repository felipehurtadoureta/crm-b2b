-- Permite etapa facturada en cotizaciones (antes solo existía orden_de_venta en algunos proyectos).
-- Ejecutar en Supabase SQL Editor si falla: quotes_stage_check al facturar.

alter table public.quotes drop constraint if exists quotes_stage_check;

alter table public.quotes
  add constraint quotes_stage_check
  check (
    stage in (
      'borrador',
      'en_negociacion',
      'enviada',
      'aceptada',
      'rechazada',
      'facturada',
      'orden_de_venta'
    )
  );

update public.quotes
set stage = 'facturada'
where stage = 'orden_de_venta';
