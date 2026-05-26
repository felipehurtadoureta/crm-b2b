-- =============================================================================
-- Documentos tributarios SII (RCV compras/ventas + boletas de honorarios)
-- Ejecutar en Supabase SQL Editor después de profiles y companies.
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

create table if not exists public.sii_connections (
  id uuid primary key default gen_random_uuid(),
  rut text not null,
  legal_name text not null default '',
  provider text not null default 'direct'
    check (provider in ('direct')),
  is_active boolean not null default true,
  initial_sync_months integer not null default 12
    check (initial_sync_months between 1 and 36),
  last_sync_at timestamptz,
  last_sync_compras_at timestamptz,
  last_sync_ventas_at timestamptz,
  last_sync_honorarios_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sii_connections_rut_unique unique (rut)
);

create index if not exists sii_connections_active_idx
  on public.sii_connections (is_active)
  where is_active = true;

-- Credenciales SII: solo accesible vía service_role (Edge Functions).
create table if not exists public.sii_connection_secrets (
  connection_id uuid primary key references public.sii_connections (id) on delete cascade,
  password_ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- Compras / documentos recibidos (RCV compra)
create table if not exists public.sii_purchase_documents (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.sii_connections (id) on delete cascade,
  periodo text not null,
  tipo_dte text not null,
  folio text not null,
  fecha_emision date not null,
  rut_emisor text not null,
  razon_social_emisor text not null default '',
  monto_neto numeric(16, 2) not null default 0,
  monto_iva numeric(16, 2) not null default 0,
  monto_total numeric(16, 2) not null default 0,
  estado_rcv text,
  company_id uuid references public.companies (id) on delete set null,
  sii_import_hash text not null,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sii_purchase_documents_hash_unique unique (sii_import_hash)
);

create index if not exists sii_purchase_documents_conn_date_idx
  on public.sii_purchase_documents (connection_id, fecha_emision desc);

create index if not exists sii_purchase_documents_rut_idx
  on public.sii_purchase_documents (rut_emisor);

-- Ventas / documentos emitidos (RCV venta)
create table if not exists public.sii_sales_documents (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.sii_connections (id) on delete cascade,
  periodo text not null,
  tipo_dte text not null,
  folio text not null,
  fecha_emision date not null,
  rut_receptor text not null,
  razon_social_receptor text not null default '',
  monto_neto numeric(16, 2) not null default 0,
  monto_iva numeric(16, 2) not null default 0,
  monto_total numeric(16, 2) not null default 0,
  estado_rcv text,
  company_id uuid references public.companies (id) on delete set null,
  sii_import_hash text not null,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sii_sales_documents_hash_unique unique (sii_import_hash)
);

create index if not exists sii_sales_documents_conn_date_idx
  on public.sii_sales_documents (connection_id, fecha_emision desc);

create index if not exists sii_sales_documents_rut_idx
  on public.sii_sales_documents (rut_receptor);

-- Boletas de honorarios (BHE recibidas / BTE)
create table if not exists public.sii_honorarium_receipts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.sii_connections (id) on delete cascade,
  periodo text not null,
  numero_boleta text not null,
  fecha date not null,
  rut_prestador text not null,
  rut_receptor text not null default '',
  nombre_prestador text not null default '',
  monto_bruto numeric(16, 2) not null default 0,
  retencion numeric(16, 2) not null default 0,
  liquido numeric(16, 2) not null default 0,
  estado text,
  tipo_boleta text not null default 'BHE'
    check (tipo_boleta in ('BHE', 'BTE')),
  company_id uuid references public.companies (id) on delete set null,
  sii_import_hash text not null,
  raw jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sii_honorarium_receipts_hash_unique unique (sii_import_hash)
);

create index if not exists sii_honorarium_receipts_conn_date_idx
  on public.sii_honorarium_receipts (connection_id, fecha desc);

create index if not exists sii_honorarium_receipts_rut_idx
  on public.sii_honorarium_receipts (rut_prestador);

-- Triggers updated_at
drop trigger if exists trg_sii_connections_updated_at on public.sii_connections;
create trigger trg_sii_connections_updated_at
  before update on public.sii_connections
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sii_purchase_documents_updated_at on public.sii_purchase_documents;
create trigger trg_sii_purchase_documents_updated_at
  before update on public.sii_purchase_documents
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sii_sales_documents_updated_at on public.sii_sales_documents;
create trigger trg_sii_sales_documents_updated_at
  before update on public.sii_sales_documents
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sii_honorarium_receipts_updated_at on public.sii_honorarium_receipts;
create trigger trg_sii_honorarium_receipts_updated_at
  before update on public.sii_honorarium_receipts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.sii_connections enable row level security;
alter table public.sii_connection_secrets enable row level security;
alter table public.sii_purchase_documents enable row level security;
alter table public.sii_sales_documents enable row level security;
alter table public.sii_honorarium_receipts enable row level security;

-- sii_connections: lectura kam/super_admin; escritura metadata solo super_admin
drop policy if exists sii_connections_select on public.sii_connections;
create policy sii_connections_select on public.sii_connections
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists sii_connections_write on public.sii_connections;
create policy sii_connections_write on public.sii_connections
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

-- sii_connection_secrets: sin políticas para authenticated (solo service_role)

-- Documentos: lectura kam/super_admin; sin INSERT/UPDATE/DELETE desde cliente
drop policy if exists sii_purchase_documents_select on public.sii_purchase_documents;
create policy sii_purchase_documents_select on public.sii_purchase_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists sii_sales_documents_select on public.sii_sales_documents;
create policy sii_sales_documents_select on public.sii_sales_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists sii_honorarium_receipts_select on public.sii_honorarium_receipts;
create policy sii_honorarium_receipts_select on public.sii_honorarium_receipts
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

comment on table public.sii_connections is 'Contribuyentes SII conectados al CRM (multi-RUT).';
comment on table public.sii_connection_secrets is 'Clave tributaria cifrada; solo Edge Functions con service_role.';
comment on table public.sii_purchase_documents is 'RCV compras / documentos recibidos del SII.';
comment on table public.sii_sales_documents is 'RCV ventas / documentos emitidos del SII.';
comment on table public.sii_honorarium_receipts is 'Boletas de honorarios (BHE/BTE) del SII.';
