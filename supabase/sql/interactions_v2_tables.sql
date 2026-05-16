-- =============================================================================
-- Módulo Interacciones v2 (nuevo): tablas `interactions` y `tasks`
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (mismo estilo que otros scripts en supabase/sql/).
--
-- Rollback (si aún no depende el código de estas tablas):
--   drop policy if exists ... on public.tasks;
--   drop policy if exists ... on public.interactions;
--   alter table public.tasks drop constraint if exists ...;
--   (o más simple:)
--   drop table if exists public.tasks cascade;
--   drop table if exists public.interactions cascade;
--   drop function if exists public.tasks_validate_row() cascade;
--   drop function if exists public.interactions_validate_row() cascade;
--   drop function if exists public.crm_user_can_write_company(uuid) cascade;
--   drop function if exists public.crm_user_can_read_company(uuid) cascade;
--   drop function if exists public.set_updated_at() cascade;
-- =============================================================================

-- Función genérica updated_at (idempotente)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Lectura: cualquier rol CRM autenticado (super_admin, kam, reader) puede leer por empresa.
-- El parámetro queda por claridad en las policies; la app ya filtra listados si hace falta.
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

-- Escritura: super_admin o KAM asignado a la empresa
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
-- Tabla: interactions
-- ---------------------------------------------------------------------------
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,

  type text not null
    check (type in (
      'call', 'meeting', 'email', 'whatsapp', 'follow_up', 'presentation',
      'note', 'visit', 'quote_sent', 'quote_update', 'quote_approved',
      'quote_rejected', 'reminder'
    )),
  title text not null,
  notes text,
  outcome text
    check (outcome is null or outcome in (
      'interested', 'not_interested', 'pending', 'follow_up_later',
      'meeting_scheduled', 'send_information', 'quote_sent', 'quote_under_review',
      'quote_approved', 'quote_rejected', 'no_response'
    )),
  next_step text,

  interaction_date timestamptz not null default now(),

  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interactions_company_id_idx on public.interactions (company_id);
create index if not exists interactions_contact_id_idx on public.interactions (contact_id);
create index if not exists interactions_quote_id_idx on public.interactions (quote_id);
create index if not exists interactions_company_date_idx on public.interactions (company_id, interaction_date desc);

drop trigger if exists trg_interactions_updated_at on public.interactions;
create trigger trg_interactions_updated_at
  before update on public.interactions
  for each row execute function public.set_updated_at();

-- Si el cliente no envía created_by, usar el usuario autenticado
create or replace function public.interactions_set_created_by()
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

drop trigger if exists trg_interactions_set_created_by on public.interactions;
create trigger trg_interactions_set_created_by
  before insert on public.interactions
  for each row execute function public.interactions_set_created_by();

-- contact_id / quote_id deben ser de la misma empresa
create or replace function public.interactions_validate_row()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.contact_id is not null then
    if not exists (
      select 1 from public.contacts c
      where c.id = new.contact_id and c.company_id = new.company_id
    ) then
      raise exception 'interactions: el contacto no pertenece a la empresa';
    end if;
  end if;
  if new.quote_id is not null then
    if not exists (
      select 1 from public.quotes q
      where q.id = new.quote_id and q.company_id = new.company_id
    ) then
      raise exception 'interactions: la cotización no pertenece a la empresa';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_interactions_validate on public.interactions;
create trigger trg_interactions_validate
  before insert or update on public.interactions
  for each row execute function public.interactions_validate_row();

-- ---------------------------------------------------------------------------
-- Tabla: tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  interaction_id uuid references public.interactions (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,

  assigned_to uuid not null references public.profiles (id) on delete restrict,

  title text not null,
  description text,

  due_date timestamptz not null,

  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_company_id_idx on public.tasks (company_id);
create index if not exists tasks_contact_id_idx on public.tasks (contact_id);
create index if not exists tasks_interaction_id_idx on public.tasks (interaction_id);
create index if not exists tasks_quote_id_idx on public.tasks (quote_id);
create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);
create index if not exists tasks_company_due_idx on public.tasks (company_id, due_date);

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create or replace function public.tasks_validate_row()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  icomp uuid;
begin
  if new.contact_id is not null then
    if not exists (
      select 1 from public.contacts c
      where c.id = new.contact_id and c.company_id = new.company_id
    ) then
      raise exception 'tasks: el contacto no pertenece a la empresa';
    end if;
  end if;
  if new.quote_id is not null then
    if not exists (
      select 1 from public.quotes q
      where q.id = new.quote_id and q.company_id = new.company_id
    ) then
      raise exception 'tasks: la cotización no pertenece a la empresa';
    end if;
  end if;
  if new.interaction_id is not null then
    select i.company_id into icomp from public.interactions i where i.id = new.interaction_id;
    if not found or icomp is distinct from new.company_id then
      raise exception 'tasks: la interacción no pertenece a la misma empresa';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_validate on public.tasks;
create trigger trg_tasks_validate
  before insert or update on public.tasks
  for each row execute function public.tasks_validate_row();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.interactions enable row level security;
alter table public.tasks enable row level security;

-- interactions: SELECT
drop policy if exists "interactions_select" on public.interactions;
create policy "interactions_select"
  on public.interactions for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

-- interactions: INSERT (reader no escribe)
drop policy if exists "interactions_insert" on public.interactions;
create policy "interactions_insert"
  on public.interactions for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

-- interactions: UPDATE / DELETE solo quien puede escribir en la empresa
drop policy if exists "interactions_update" on public.interactions;
create policy "interactions_update"
  on public.interactions for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "interactions_delete" on public.interactions;
create policy "interactions_delete"
  on public.interactions for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));

-- tasks: SELECT (misma regla de lectura por empresa)
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
  on public.tasks for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

-- tasks: INSERT — super_admin o KAM vinculado a la empresa (company_kams)
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert"
  on public.tasks for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update"
  on public.tasks for update
  to authenticated
  using (
    public.crm_user_can_write_company(company_id)
    or assigned_to = auth.uid()
  )
  with check (
    public.crm_user_can_write_company(company_id)
    or assigned_to = auth.uid()
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete"
  on public.tasks for delete
  to authenticated
  using (
    public.crm_user_can_write_company(company_id)
    or assigned_to = auth.uid()
  );
