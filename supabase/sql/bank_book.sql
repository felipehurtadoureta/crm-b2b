-- =============================================================================
-- Libro de banco — cartola Banco de Chile (importación Excel)
-- Ejecutar en Supabase SQL Editor después de profiles.
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

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null default 'Banco de Chile',
  account_number text not null,
  account_label text,
  holder_name text,
  holder_rut text,
  currency text not null default 'CLP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_accounts_number_unique unique (bank_name, account_number)
);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  movement_date date not null,
  description text not null default '',
  debit numeric(16, 2) not null default 0,
  credit numeric(16, 2) not null default 0,
  balance numeric(16, 2),
  document_number text,
  trn text,
  branch text,
  invoice_id uuid references public.invoices (id) on delete set null,
  glosa text,
  import_hash text not null,
  raw jsonb,
  imported_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_transactions_import_hash_unique unique (import_hash)
);

create index if not exists bank_transactions_account_date_idx
  on public.bank_transactions (bank_account_id, movement_date desc);

create index if not exists bank_transactions_invoice_idx
  on public.bank_transactions (invoice_id)
  where invoice_id is not null;

drop trigger if exists trg_bank_accounts_updated_at on public.bank_accounts;
create trigger trg_bank_accounts_updated_at
  before update on public.bank_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_bank_transactions_updated_at on public.bank_transactions;
create trigger trg_bank_transactions_updated_at
  before update on public.bank_transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — lectura super_admin y kam; escritura solo super_admin
-- ---------------------------------------------------------------------------

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists bank_accounts_select on public.bank_accounts;
create policy bank_accounts_select on public.bank_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists bank_accounts_write on public.bank_accounts;
create policy bank_accounts_write on public.bank_accounts
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists bank_transactions_select on public.bank_transactions;
create policy bank_transactions_select on public.bank_transactions
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists bank_transactions_insert on public.bank_transactions;
create policy bank_transactions_insert on public.bank_transactions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );

drop policy if exists bank_transactions_update on public.bank_transactions;
create policy bank_transactions_update on public.bank_transactions
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists bank_transactions_delete on public.bank_transactions;
create policy bank_transactions_delete on public.bank_transactions
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin'
    )
  );
