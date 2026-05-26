-- Tipo de próximo contacto (Reunión / Mail / Llamado) en seguimientos y recordatorios de agenda.
-- Ejecutar en SQL Editor después de commercial_followups.sql (y commercial_followups_importance.sql si aplica).

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commercial_followups' and column_name = 'next_follow_up_kind'
  ) then
    alter table public.commercial_followups
      add column next_follow_up_kind text
      check (next_follow_up_kind is null or next_follow_up_kind in ('reunion', 'mail', 'llamado'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commercial_followup_reminders' and column_name = 'next_follow_up_kind'
  ) then
    alter table public.commercial_followup_reminders
      add column next_follow_up_kind text
      check (next_follow_up_kind is null or next_follow_up_kind in ('reunion', 'mail', 'llamado'));
  end if;
end $$;

create or replace function public.commercial_followups_after_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.commercial_followup_reminders r
  set
    status = 'superseded',
    closed_at = now(),
    closed_reason = 'new_followup',
    updated_at = now()
  where r.status = 'open'
    and r.company_id = new.company_id
    and r.subject_type = new.subject_type
    and (
      (new.subject_type = 'company' and r.quote_id is null and r.invoice_id is null)
      or (new.subject_type = 'quote' and r.quote_id = new.quote_id)
      or (new.subject_type = 'invoice' and r.invoice_id = new.invoice_id)
    );

  if new.next_follow_up_at is not null then
    insert into public.commercial_followup_reminders (
      company_id,
      subject_type,
      quote_id,
      invoice_id,
      due_date,
      status,
      source_followup_id,
      importance,
      next_follow_up_kind
    )
    values (
      new.company_id,
      new.subject_type,
      case when new.subject_type = 'quote' then new.quote_id else null end,
      case when new.subject_type = 'invoice' then new.invoice_id else null end,
      new.next_follow_up_at,
      'open',
      new.id,
      coalesce(new.importance, 'media'),
      coalesce(new.next_follow_up_kind, 'llamado')
    );
  end if;

  return new;
end;
$$;
