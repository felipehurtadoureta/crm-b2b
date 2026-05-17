-- =============================================================================
-- Catálogo de glosas contables + reglas de sugerencia por texto en descripción
-- Ejecutar después de bank_book.sql
-- =============================================================================

create table if not exists public.bank_glosas (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  /** Palabras o frases (mayúsculas/minúsculas indistinto) que activan la sugerencia */
  match_keywords text[] not null default '{}',
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_glosas_code_unique unique (code)
);

create index if not exists bank_glosas_active_order_idx
  on public.bank_glosas (is_active, sort_order, code);

drop trigger if exists trg_bank_glosas_updated_at on public.bank_glosas;
create trigger trg_bank_glosas_updated_at
  before update on public.bank_glosas
  for each row execute function public.set_updated_at();

alter table public.bank_glosas enable row level security;

drop policy if exists bank_glosas_select on public.bank_glosas;
create policy bank_glosas_select on public.bank_glosas
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('super_admin', 'kam')
    )
  );

drop policy if exists bank_glosas_write on public.bank_glosas;
create policy bank_glosas_write on public.bank_glosas
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

-- Glosas iniciales (puede editarlas en Administrar glosas)
insert into public.bank_glosas (code, name, match_keywords, sort_order)
values
  ('FC', 'Factura compra', array['FACTURA COMPRA', 'COMPRA', 'PROVEEDOR', 'FC '], 10),
  ('FV', 'Factura venta', array['FACTURA VENTA', 'COBRO', 'CLIENTE', 'FV ', 'INVERSIONES'], 20),
  ('PAGO_IVA', 'Pago IVA', array['IVA', 'SII.CL', 'SII', 'IMPUESTO', 'TGR'], 30),
  ('PREVIRED', 'Previred', array['PREVIRED', 'PREVI', 'REMUNERACION', 'COTIZACION'], 40),
  ('TRASPASO', 'Traspaso', array['TRASPASO', 'TRANSFERENCIA'], 50),
  ('HONORARIOS', 'Honorarios', array['HONORARIO', 'ASESORIA', 'ASESORIAS'], 60),
  ('COMISION', 'Comisión bancaria', array['COMISION', 'MANTENCION', 'CARGO BANCO'], 70),
  ('SUELDO', 'Sueldos', array['SUELDO', 'REMUNERACION', 'LIQUIDACION'], 80)
on conflict (code) do nothing;

comment on table public.bank_glosas is 'Glosas contables para clasificar movimientos del libro de banco.';
comment on column public.bank_transactions.glosa is 'Código de glosa (bank_glosas.code).';
