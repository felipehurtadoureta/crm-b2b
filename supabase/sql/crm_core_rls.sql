-- =============================================================================
-- RLS del núcleo CRM (tablas base sin políticas en el esquema inicial)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (una vez por proyecto).
--
-- Antes: ver qué tablas están expuestas:
--   select tablename from pg_tables
--   where schemaname = 'public' and rowsecurity = false
--   order by tablename;
--
-- Requiere funciones helper (interactions_v2_tables.sql o commercial_followups.sql).
-- Idempotente: puede ejecutarse más de una vez.
-- =============================================================================

-- Helpers (idempotentes)
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
      and p.is_active = true
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
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active = true and p.role = 'super_admin'
    )
    or exists (
      select 1 from public.company_kams ck
      where ck.company_id = p_company_id and ck.kam_id = auth.uid()
    );
$$;

-- Lee el rol del usuario actual sin depender de RLS (evita bloqueo circular en profiles).
create or replace function public.crm_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active = true
  limit 1;
$$;

create or replace function public.crm_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.crm_my_role() is not null;
$$;

create or replace function public.crm_user_has_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.crm_my_role(), '') = any (p_roles);
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_active on public.profiles;
create policy profiles_select_active
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.crm_my_role() in ('super_admin', 'kam', 'reader')
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- profiles_update_by_super_admin: ver profiles_super_admin_update.sql

-- ---------------------------------------------------------------------------
-- companies / company_kams
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select
  on public.companies for select
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam', 'reader']));

drop policy if exists companies_insert on public.companies;
create policy companies_insert
  on public.companies for insert
  to authenticated
  with check (public.crm_user_has_role(array['super_admin', 'kam']));

drop policy if exists companies_update on public.companies;
create policy companies_update
  on public.companies for update
  to authenticated
  using (public.crm_user_can_write_company(id))
  with check (public.crm_user_can_write_company(id));

drop policy if exists companies_delete on public.companies;
create policy companies_delete
  on public.companies for delete
  to authenticated
  using (public.crm_user_has_role(array['super_admin']));

alter table public.company_kams enable row level security;

drop policy if exists company_kams_select on public.company_kams;
create policy company_kams_select
  on public.company_kams for select
  to authenticated
  using (public.crm_user_is_active());

drop policy if exists company_kams_insert on public.company_kams;
create policy company_kams_insert
  on public.company_kams for insert
  to authenticated
  with check (
    public.crm_user_can_write_company(company_id)
    or (
      kam_id = auth.uid()
      and public.crm_user_has_role(array['super_admin', 'kam'])
    )
  );

drop policy if exists company_kams_update on public.company_kams;
create policy company_kams_update
  on public.company_kams for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists company_kams_delete on public.company_kams;
create policy company_kams_delete
  on public.company_kams for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
alter table public.contacts enable row level security;

drop policy if exists contacts_select on public.contacts;
create policy contacts_select
  on public.contacts for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert
  on public.contacts for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists contacts_update on public.contacts;
create policy contacts_update
  on public.contacts for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete
  on public.contacts for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));

-- ---------------------------------------------------------------------------
-- quotes / quote_items / quote_item_serial_assignments
-- ---------------------------------------------------------------------------
alter table public.quotes enable row level security;

drop policy if exists quotes_select on public.quotes;
create policy quotes_select
  on public.quotes for select
  to authenticated
  using (public.crm_user_can_read_company(company_id));

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert
  on public.quotes for insert
  to authenticated
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists quotes_update on public.quotes;
create policy quotes_update
  on public.quotes for update
  to authenticated
  using (public.crm_user_can_write_company(company_id))
  with check (public.crm_user_can_write_company(company_id));

drop policy if exists quotes_delete on public.quotes;
create policy quotes_delete
  on public.quotes for delete
  to authenticated
  using (public.crm_user_can_write_company(company_id));

alter table public.quote_items enable row level security;

drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select
  on public.quote_items for select
  to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.crm_user_can_read_company(q.company_id)
    )
  );

drop policy if exists quote_items_insert on public.quote_items;
create policy quote_items_insert
  on public.quote_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.crm_user_can_write_company(q.company_id)
    )
  );

drop policy if exists quote_items_update on public.quote_items;
create policy quote_items_update
  on public.quote_items for update
  to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.crm_user_can_write_company(q.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.crm_user_can_write_company(q.company_id)
    )
  );

drop policy if exists quote_items_delete on public.quote_items;
create policy quote_items_delete
  on public.quote_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.crm_user_can_write_company(q.company_id)
    )
  );

alter table public.quote_item_serial_assignments enable row level security;

drop policy if exists qisa_select on public.quote_item_serial_assignments;
create policy qisa_select
  on public.quote_item_serial_assignments for select
  to authenticated
  using (
    exists (
      select 1
      from public.quote_items qi
      join public.quotes q on q.id = qi.quote_id
      where qi.id = quote_item_id
        and public.crm_user_can_read_company(q.company_id)
    )
  );

drop policy if exists qisa_write on public.quote_item_serial_assignments;
create policy qisa_write
  on public.quote_item_serial_assignments for all
  to authenticated
  using (
    exists (
      select 1
      from public.quote_items qi
      join public.quotes q on q.id = qi.quote_id
      where qi.id = quote_item_id
        and public.crm_user_can_write_company(q.company_id)
    )
  )
  with check (
    exists (
      select 1
      from public.quote_items qi
      join public.quotes q on q.id = qi.quote_id
      where qi.id = quote_item_id
        and public.crm_user_can_write_company(q.company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- products / inventario
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;

drop policy if exists products_select on public.products;
create policy products_select
  on public.products for select
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam', 'reader']));

drop policy if exists products_write on public.products;
create policy products_write
  on public.products for all
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam']))
  with check (public.crm_user_has_role(array['super_admin', 'kam']));

alter table public.inventory_items enable row level security;

drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select
  on public.inventory_items for select
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam']));

drop policy if exists inventory_items_write on public.inventory_items;
create policy inventory_items_write
  on public.inventory_items for all
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam']))
  with check (public.crm_user_has_role(array['super_admin', 'kam']));

alter table public.product_price_history enable row level security;

drop policy if exists product_price_history_select on public.product_price_history;
create policy product_price_history_select
  on public.product_price_history for select
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam']));

drop policy if exists product_price_history_insert on public.product_price_history;
create policy product_price_history_insert
  on public.product_price_history for insert
  to authenticated
  with check (public.crm_user_has_role(array['super_admin', 'kam']));

-- ---------------------------------------------------------------------------
-- calls (solo KAM / super_admin)
-- ---------------------------------------------------------------------------
alter table public.calls enable row level security;

drop policy if exists calls_select on public.calls;
create policy calls_select
  on public.calls for select
  to authenticated
  using (public.crm_user_has_role(array['super_admin', 'kam']));

drop policy if exists calls_insert on public.calls;
create policy calls_insert
  on public.calls for insert
  to authenticated
  with check (
    public.crm_user_has_role(array['super_admin', 'kam'])
    and public.crm_user_can_write_company(company_id)
  );

drop policy if exists calls_update on public.calls;
create policy calls_update
  on public.calls for update
  to authenticated
  using (
    public.crm_user_has_role(array['super_admin', 'kam'])
    and public.crm_user_can_write_company(company_id)
  )
  with check (
    public.crm_user_has_role(array['super_admin', 'kam'])
    and public.crm_user_can_write_company(company_id)
  );

drop policy if exists calls_delete on public.calls;
create policy calls_delete
  on public.calls for delete
  to authenticated
  using (
    public.crm_user_has_role(array['super_admin', 'kam'])
    and public.crm_user_can_write_company(company_id)
  );

-- ---------------------------------------------------------------------------
-- Tablas legacy opcionales (comentar si no existen en tu proyecto)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.activities') is not null then
    execute 'alter table public.activities enable row level security';
    execute 'drop policy if exists activities_select on public.activities';
    execute $p$
      create policy activities_select on public.activities for select to authenticated
      using (public.crm_user_can_read_company(company_id))
    $p$;
    execute 'drop policy if exists activities_write on public.activities';
    execute $p$
      create policy activities_write on public.activities for all to authenticated
      using (public.crm_user_can_write_company(company_id))
      with check (public.crm_user_can_write_company(company_id))
    $p$;
  end if;

  if to_regclass('public.deals') is not null then
    execute 'alter table public.deals enable row level security';
    execute 'drop policy if exists deals_select on public.deals';
    execute $p$
      create policy deals_select on public.deals for select to authenticated
      using (public.crm_user_can_read_company(company_id))
    $p$;
    execute 'drop policy if exists deals_write on public.deals';
    execute $p$
      create policy deals_write on public.deals for all to authenticated
      using (public.crm_user_can_write_company(company_id))
      with check (public.crm_user_can_write_company(company_id))
    $p$;
  end if;

  if to_regclass('public.sales_orders') is not null then
    execute 'alter table public.sales_orders enable row level security';
    execute 'drop policy if exists sales_orders_select on public.sales_orders';
    execute $p$
      create policy sales_orders_select on public.sales_orders for select to authenticated
      using (public.crm_user_can_read_company(company_id))
    $p$;
    execute 'drop policy if exists sales_orders_write on public.sales_orders';
    execute $p$
      create policy sales_orders_write on public.sales_orders for all to authenticated
      using (public.crm_user_can_write_company(company_id))
      with check (public.crm_user_can_write_company(company_id))
    $p$;
  end if;

  if to_regclass('public.sales_order_items') is not null then
    execute 'alter table public.sales_order_items enable row level security';
    execute 'drop policy if exists sales_order_items_select on public.sales_order_items';
    execute $p$
      create policy sales_order_items_select on public.sales_order_items for select to authenticated
      using (
        exists (
          select 1 from public.sales_orders so
          where so.id = sales_order_id
            and public.crm_user_can_read_company(so.company_id)
        )
      )
    $p$;
    execute 'drop policy if exists sales_order_items_write on public.sales_order_items';
    execute $p$
      create policy sales_order_items_write on public.sales_order_items for all to authenticated
      using (
        exists (
          select 1 from public.sales_orders so
          where so.id = sales_order_id
            and public.crm_user_can_write_company(so.company_id)
        )
      )
      with check (
        exists (
          select 1 from public.sales_orders so
          where so.id = sales_order_id
            and public.crm_user_can_write_company(so.company_id)
        )
      )
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- select tablename from pg_tables
-- where schemaname = 'public' and rowsecurity = false
-- order by tablename;
