-- =============================================================================
-- Quitar duplicado “Próximo contacto” (calls) vs “Seguimiento desde llamada” (activities)
-- =============================================================================
-- El trigger trg_calls_create_activity insertaba una tarea en activities cada vez
-- que next_contact_date tenía valor o cambiaba, sin borrar la anterior → duplicados.
--
-- Criterio del CRM: el recordatorio “cuándo volver a contactar” vive en calls.next_contact_date;
-- la agenda ya lo lista como “Próximo contacto”. No hace falta crear activities automáticas.
--
-- Ejecutar en Supabase → SQL Editor (una vez).
-- =============================================================================

-- 1) Dejar de crear tareas al tocar next_contact_date
DROP TRIGGER IF EXISTS trg_calls_create_activity ON public.calls;

DROP FUNCTION IF EXISTS public.create_activity_from_call();

-- 2) Opcional: limpiar tareas ya generadas por ese trigger (mismo título y auto_generated)
-- Descomentá las 4 líneas siguientes si querés borrar el histórico de esas tareas duplicadas:
--
-- DELETE FROM public.activities
-- WHERE auto_generated = true
--   AND title = 'Seguimiento desde llamada'
--   AND call_id IS NOT NULL;
