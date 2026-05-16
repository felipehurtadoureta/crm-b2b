-- =============================================================================
-- Seguimientos comerciales + recordatorios en agenda + facturas (stub)
-- Reutiliza si ya existen: set_updated_at, crm_user_can_read_company,
-- crm_user_can_write_company (p. ej. desde interactions_v2_tables.sql).
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.crm_user_can_read_company(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'reader', 'kam')
  );
$$;

create or replace function public.crm_user_can_write_company(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
    or exists (
      select 1 from public.company_kams ck
      where ck.company_id = p_company_id and ck.kam_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Facturas (mínimo viable; el módulo de UI puede extenderse después)
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  invoice_number text not null,
  title text,
  status text not null default 'pendiente'
    check (status in ('borrador', 'pendiente', 'pagada', 'anulada')),
  total numeric not null default 0,
  currency text not null default 'CLP',
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_company_id_idx on public.invoices (company_id);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Historial de seguimientos (una fila por intervención registrada)
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subject_type text not null
    check (subject_type in ('company', 'quote', 'invoice')),
  quote_id uuid references public.quotes (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  followed_at timestamptz not null default now(),
  body text not null default '',
  importance text not null default 'media'
    check (importance in ('baja', 'media', 'alta')),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_followups_subject_company_ck check (
    subject_type <> 'company' or (quote_id is null and invoice_id is null)
  ),
  constraint commercial_followups_subject_quote_ck check (
    subject_type <> 'quote' or (quote_id is not null and invoice_id is null)
  ),
  constraint commercial_followups_subject_invoice_ck check (
    subject_type <> 'invoice' or (invoice_id is not null and quote_id is null)
  )
);

create index if not exists commercial_followups_company_idx
  on public.commercial_followups (company_id, followed_at desc);
create index if not exists commercial_followups_quote_idx
  on public.commercial_followups (quote_id)
  where quote_id is not null;
create index if not exists commercial_followups_invoice_idx
  on public.commercial_followups (invoice_id)
  where invoice_id is not null;

drop trigger if exists trg_commercial_followups_updated_at on public.commercial_followups;
create trigger trg_commercial_followups_updated_at
  before update on public.commercial_followups
  for each row execute function public.set_updated_at();

create or replace function public.commercial_followups_set_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_commercial_followups_set_created_by on public.commercial_followups;
create trigger trg_commercial_followups_set_created_by
  before insert on public.commercial_followups
  for each row execute function public.commercial_followups_set_created_by();

-- Validación empresa / etapa cotización / factura
create or replace function public.commercial_followups_validate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  qstage text;
  inv public.invoices%rowtype;
begin
  if new.contact_id is not null then
    if not exists (
      select 1 from public.contacts c
      where c.id = new.contact_id and c.company_id = new.company_id
    ) then
      raise exception 'commercial_followups: el contacto no pertenece a la empresa';
    end if;
  end if;

  if new.subject_type = 'quote' then
    if not exists (
      select 1 from public.quotes q
      where q.id = new.quote_id and q.company_id = new.company_id
    ) then
      raise exception 'commercial_followups: la cotización no pertenece a la empresa';
    end if;
    select stage into qstage from public.quotes where id = new.quote_id;
    if qstage in ('aceptada', 'rechazada', 'orden_de_venta') then
      raise exception 'commercial_followups: cotización cerrada; no se registran seguimientos';
    end if;
  end if;

  if new.subject_type = 'invoice' then
    select * into inv from public.invoices where id = new.invoice_id;
    if not found then
      raise exception 'commercial_followups: factura no encontrada';
    end if;
    if inv.company_id is distinct from new.company_id then
      raise exception 'commercial_followups: la factura no pertenece a la empresa';
    end if;
    if inv.status = 'pagada' then
      raise exception 'commercial_followups: la factura ya está pagada';
    end if;
    if inv.status = 'anulada' then
      raise exception 'commercial_followups: factura anulada';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_commercial_followups_validate on public.commercial_followups;
create trigger trg_commercial_followups_validate
  before insert or update on public.commercial_followups
  for each row execute function public.commercial_followups_validate();

-- Tras guardar: cerrar recordatorio abierto del mismo hilo y abrir uno nuevo si hay próxima fecha
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
      company_id, subject_type, quote_id, invoice_id, due_date, status, source_followup_id, importance
    )
    values (
      new.company_id,
      new.subject_type,
      case when new.subject_type = 'quote' then new.quote_id else null end,
      case when new.subject_type = 'invoice' then new.invoice_id else null end,
      new.next_follow_up_at,
      'open',
      new.id,
      coalesce(new.importance, 'media')
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recordatorios abiertos (agenda): a lo sumo uno «open» por hilo
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_followup_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subject_type text not null
    check (subject_type in ('company', 'quote', 'invoice')),
  quote_id uuid references public.quotes (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  due_date timestamptz not null,
  importance text not null default 'media'
    check (importance in ('baja', 'media', 'alta')),
  status text not null default 'open'
    check (status in ('open', 'superseded', 'cancelled')),
  source_followup_id uuid references public.commercial_followups (id) on delete set null,
  closed_at timestamptz,
  closed_reason text
    check (
      closed_reason is null
      or closed_reason in (
        'new_followup',
        'manual',
        'quote_closed',
        'invoice_paid',
        'invoice_cancelled'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cfr_subject_company_ck check (
    subject_type <> 'company' or (quote_id is null and invoice_id is null)
  ),
  constraint cfr_subject_quote_ck check (
    subject_type <> 'quote' or (quote_id is not null and invoice_id is null)
  ),
  constraint cfr_subject_invoice_ck check (
    subject_type <> 'invoice' or (invoice_id is not null and quote_id is null)
  )
);

create index if not exists cfr_company_due_idx
  on public.commercial_followup_reminders (company_id, due_date);
create index if not exists cfr_due_open_idx
  on public.commercial_followup_reminders (due_date)
  where status = 'open';

create unique index if not exists cfr_one_open_company
  on public.commercial_followup_reminders (company_id)
  where subject_type = 'company' and status = 'open';

create unique index if not exists cfr_one_open_quote
  on public.commercial_followup_reminders (quote_id)
  where subject_type = 'quote' and status = 'open';

create unique index if not exists cfr_one_open_invoice
  on public.commercial_followup_reminders (invoice_id)
  where subject_type = 'invoice' and status = 'open';

drop trigger if exists trg_commercial_followup_reminders_updated_at on public.commercial_followup_reminders;
create trigger trg_commercial_followup_reminders_updated_at
  before update on public.commercial_followup_reminders
  for each row execute function public.set_updated_at();

-- Orden: reminders debe existir antes del trigger que inserta en reminders from followups.
-- Por eso el trigger after_insert se crea después de la tabla reminders:

drop trigger if exists trg_commercial_followups_after_ins on public.commercial_followups;
create trigger trg_commercial_followups_after_ins
  after insert on public.commercial_followups
  for each row execute function public.commercial_followups_after_insert();

-- Cierre de hilos: cotización en etapa final
create or replace function public.quotes_close_commercial_reminders()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage
    and new.stage in ('aceptada', 'rechazada', 'orden_de_venta') then
    update public.commercial_followup_reminders r
    set
      status = 'cancelled',
      closed_at = now(),
      closed_reason = 'quote_closed',
      updated_at = now()
    where r.status = 'open'
      and r.subject_type = 'quote'
      and r.quote_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quotes_close_commercial_reminders on public.quotes;
create trigger trg_quotes_close_commercial_reminders
  after update of stage on public.quotes
  for each row execute function public.quotes_close_commercial_reminders();

-- Factura pagada o anulada
create or replace function public.invoices_close_commercial_reminders()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pagada' then
      update public.commercial_followup_reminders r
      set
        status = 'cancelled',
        closed_at = now(),
        closed_reason = 'invoice_paid',
        updated_at = now()
      where r.status = 'open'
        and r.subject_type = 'invoice'
        and r.invoice_id = new.id;
    elsif new.status = 'anulada' then
      update public.commercial_followup_reminders r
      set
        status = 'cancelled',
        closed_at = now(),
        closed_reason = 'invoice_cancelled',
        updated_at = now()
      where r.status = 'open'
        and r.subject_type = 'invoice'
        and r.invoice_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_close_commercial_reminders on public.invoices;
create trigger trg_invoices_close_commercial_reminders
  after update of status on public.invoices
  for each row execute function public.invoices_close_commercial_reminders();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;

drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select"
  on public.invoices for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

drop policy if exists "invoices_insert" on public.invoices;
create policy "invoices_insert"
  on public.invoices for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "invoices_update" on public.invoices;
create policy "invoices_update"
  on public.invoices for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_delete"
  on public.invoices for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));

alter table public.commercial_followups enable row level security;

drop policy if exists "commercial_followups_select" on public.commercial_followups;
create policy "commercial_followups_select"
  on public.commercial_followups for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

drop policy if exists "commercial_followups_insert" on public.commercial_followups;
create policy "commercial_followups_insert"
  on public.commercial_followups for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "commercial_followups_update" on public.commercial_followups;
create policy "commercial_followups_update"
  on public.commercial_followups for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "commercial_followups_delete" on public.commercial_followups;
create policy "commercial_followups_delete"
  on public.commercial_followups for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));

alter table public.commercial_followup_reminders enable row level security;

drop policy if exists "cfr_select" on public.commercial_followup_reminders;
create policy "cfr_select"
  on public.commercial_followup_reminders for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

drop policy if exists "cfr_insert" on public.commercial_followup_reminders;
create policy "cfr_insert"
  on public.commercial_followup_reminders for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "cfr_update" on public.commercial_followup_reminders;
create policy "cfr_update"
  on public.commercial_followup_reminders for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "cfr_delete" on public.commercial_followup_reminders;
create policy "cfr_delete"
  on public.commercial_followup_reminders for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));
