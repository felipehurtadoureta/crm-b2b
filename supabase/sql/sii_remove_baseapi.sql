-- Deja todas las conexiones SII en modo importación por archivo (sin BaseAPI).
-- Ejecutar si tenía filas con provider = 'baseapi'.

update public.sii_connections set provider = 'direct' where provider = 'baseapi';

-- Opcional en proyectos nuevos: forzar solo 'direct' (comentar si aún tiene filas legacy)
-- alter table public.sii_connections drop constraint if exists sii_connections_provider_check;
-- alter table public.sii_connections add constraint sii_connections_provider_check check (provider in ('direct'));
