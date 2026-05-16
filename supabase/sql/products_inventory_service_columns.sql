-- Columnas de producto alineadas con la UI (ProductDialog / ProductsPage).
-- Ejecutar en Supabase SQL Editor en proyectos donde `public.products` ya exista.
--
-- has_inventory: solo aplica a filas físicas (type = 'product' o 'inventory' en datos legacy).
--                Si es true, el producto puede tener filas en `inventory_items`.
-- service_category: texto libre para servicios (type = 'service'); suele quedar null en productos.

alter table public.products
  add column if not exists has_inventory boolean not null default false;

alter table public.products
  add column if not exists service_category text;

comment on column public.products.has_inventory is
  'Indica si el artículo físico gestiona stock propio (seriales en inventory_items). Ignorado para servicios.';

comment on column public.products.service_category is
  'Etiqueta opcional de categoría cuando type es servicio (ej. consultoría, instalación).';

comment on column public.products.type is
  'Tipo comercial: product | service (UI); puede existir inventory en datos antiguos, tratado como producto físico.';
