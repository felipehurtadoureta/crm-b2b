# Flujo comercial: interacciones, cotizaciones y agenda

Checklist de pantallas y alineación con el modelo B2B (crm-v1). La ruta `/calls` sigue siendo la lista global; en la UI el módulo se llama **Interacciones** (registros sin `quote_id` = vista de prospección).

## Estado de implementación

| Área | Comportamiento esperado | Estado |
|------|-------------------------|--------|
| Ficha empresa | CTA **Registrar interacción** (cabecera + bloque historial) | Hecho |
| Ficha empresa | Diálogo con empresa fija y contacto sugerido (principal o primer activo) | Hecho |
| Ficha empresa | **Guardar e ir a cotización** → `/quotes` con `openNew` + `companyId` | Hecho |
| Ficha empresa | Historial **unificado** por fecha (empresa + cotización) | Hecho |
| Cotización | Interacciones de seguimiento con `quote_id` (QuoteDialog) | Ya existía |
| Lista global `/calls` | Solo filas sin cotización vinculada; deep-link por `id` carga la fila aunque no esté en la lista | Hecho / ya soportado |
| Navegación | Menú: etiqueta **Interacciones** (ruta `/calls`) | Hecho |
| Agenda | Pendientes: tareas, próximo contacto (`next_contact_date`), cierres | Ya existía |
| Auditoría de cambios de cotización | Historial de cambios de montos/etapas ligado a interacciones | **Futuro** (tabla/triggers en Supabase) |

## Notas técnicas

- **Interacción** = fila en `calls` (tipo: llamada, WhatsApp, email, reunión, visita).
- **Prospección** en código = `quote_id` nulo en esa fila.
- **Próximo contacto** en agenda = `next_contact_date` en la interacción (no confundir con actividades tipo tarea).

## Referencias en código

- `src/pages/companies/CompanyWorkspacePage.tsx` — CTA, historial unificado, props de `CallDialog`.
- `src/pages/calls/CallDialog.tsx` — `lockCompany`, `onAfterSaveGoToNewQuote`, persistencia compartida.
- `src/pages/quotes/QuotesPage.tsx` — consume `location.state.openNew` y `companyId` para abrir nueva cotización.
- `src/lib/permissions.ts` — `NAV_ITEMS_CONFIG` ítem `calls`.
