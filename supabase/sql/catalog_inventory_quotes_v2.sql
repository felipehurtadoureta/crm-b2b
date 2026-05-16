-- =============================================================================
-- CRM v2: inventario (custodia / valor referencia) + líneas de cotización v2
-- =============================================================================
-- Ejecutar en Supabase SQL Editor después del esquema base (products, quotes…).
--
-- quote_items:
--   line_kind: stock | procure | service | custom
--   pricing_model: sale | monthly_rental
--   procurement_plan: manufacture | purchase (solo procure)
--   inventory_item_id: opcional en cotización (asignación tardía)
--
-- inventory_items:
--   custody: bodega | en_cliente | prestamo | transito
--   reference_price / reference_currency: valor de referencia por serie (opcional)
--   custody_company_id: cliente asociado si aplica
--
-- quote_item_serial_assignments: cumplimiento (serie ↔ línea) cuando el negocio cierra.
-- =============================================================================

-- ─── Inventario ──────────────────────────────────────────────────────────────
alter table public.inventory_items
  add column if not exists custody text not null default 'bodega';

alter table public.inventory_items
  add column if not exists reference_price numeric;

alter table public.inventory_items
  add column if not exists reference_currency text;

alter table public.inventory_items
  add column if not exists custody_company_id uuid references public.companies (id) on delete set null;

comment on column public.inventory_items.custody is
  'Custodia física/comercial: bodega, en_cliente, prestamo, transito.';

comment on column public.inventory_items.reference_price is
  'Valor de referencia de la unidad (lista o costo); opcional.';

comment on column public.inventory_items.reference_currency is
  'Moneda del valor de referencia: CLP, USD o UF.';

comment on column public.inventory_items.custody_company_id is
  'Empresa cliente cuando custody es en_cliente o prestamo (opcional).';

-- ─── Líneas de cotización ────────────────────────────────────────────────────
alter table public.quote_items
  add column if not exists line_kind text not null default 'stock';

alter table public.quote_items
  add column if not exists pricing_model text not null default 'sale';

alter table public.quote_items
  add column if not exists procurement_plan text;

alter table public.quote_items
  add column if not exists inventory_item_id uuid references public.inventory_items (id) on delete set null;

comment on column public.quote_items.line_kind is
  'stock (desde inventario), procure (comprar/fabricar), service, custom (ítem libre).';

comment on column public.quote_items.pricing_model is
  'sale (venta) o monthly_rental (arriendo mensual por línea).';

comment on column public.quote_items.procurement_plan is
  'manufacture | purchase cuando line_kind = procure.';

comment on column public.quote_items.inventory_item_id is
  'Serie asignada en cotización solo si ya se definió; normalmente null hasta cumplimiento.';

-- ─── Asignaciones serie ↔ línea (post-cierre / despacho) ─────────────────────
create table if not exists public.quote_item_serial_assignments (
  id uuid primary key default gen_random_uuid (),
  quote_item_id uuid not null references public.quote_items (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  created_at timestamp with time zone not null default now (),
  unique (inventory_item_id)
);

create index if not exists idx_quote_item_serial_assignments_quote_item
  on public.quote_item_serial_assignments (quote_item_id);

comment on table public.quote_item_serial_assignments is
  'Registra qué número de serie cumple cada línea de cotización tras cerrar el negocio.';
