-- Sincroniza recordatorios de seguimiento en cotización al cambiar etapa:
-- cierra pendientes abiertos al pasar a aceptada / rechazada / facturada;
-- reabre los cerrados por quote_closed al volver a etapas abiertas.
-- Ejecutar en Supabase SQL Editor si ya tiene commercial_followups.sql aplicado.

create or replace function public.quote_stage_closes_followups(st text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    case when st = 'orden_de_venta' then 'facturada' else st end,
    'borrador'
  ) in ('aceptada', 'rechazada', 'facturada');
$$;

create or replace function public.quotes_close_commercial_reminders()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_closed boolean;
  new_closed boolean;
begin
  if new.stage is distinct from old.stage then
    old_closed := public.quote_stage_closes_followups(old.stage::text);
    new_closed := public.quote_stage_closes_followups(new.stage::text);

    if new_closed and not old_closed then
      update public.commercial_followup_reminders r
      set
        status = 'cancelled',
        closed_at = now(),
        closed_reason = 'quote_closed',
        updated_at = now()
      where r.status = 'open'
        and r.subject_type = 'quote'
        and r.quote_id = new.id;
    elsif old_closed and not new_closed then
      update public.commercial_followup_reminders r
      set
        status = 'open',
        closed_at = null,
        closed_reason = null,
        updated_at = now()
      where r.status = 'cancelled'
        and r.closed_reason = 'quote_closed'
        and r.subject_type = 'quote'
        and r.quote_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_close_commercial_reminders on public.quotes;
create trigger trg_quotes_close_commercial_reminders
  after update of stage on public.quotes
  for each row execute function public.quotes_close_commercial_reminders();
