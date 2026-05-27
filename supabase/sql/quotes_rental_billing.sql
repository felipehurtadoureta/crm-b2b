-- Facturación recurrente (arriendo mensual) en cotizaciones facturadas.
-- Ejecutar en Supabase SQL Editor.

alter table public.quotes
  add column if not exists rental_billing_day smallint,
  add column if not exists rental_last_billed_period text;

comment on column public.quotes.rental_billing_day is
  'Día del mes (1–28) en que alertar facturación de mensualidad de arriendo.';

comment on column public.quotes.rental_last_billed_period is
  'Último período mensual facturado (YYYY-MM).';

alter table public.quotes drop constraint if exists quotes_rental_billing_day_check;

alter table public.quotes
  add constraint quotes_rental_billing_day_check
  check (rental_billing_day is null or (rental_billing_day >= 1 and rental_billing_day <= 28));

alter table public.quotes drop constraint if exists quotes_rental_last_billed_period_check;

alter table public.quotes
  add constraint quotes_rental_last_billed_period_check
  check (
    rental_last_billed_period is null
    or rental_last_billed_period ~ '^\d{4}-(0[1-9]|1[0-2])$'
  );
