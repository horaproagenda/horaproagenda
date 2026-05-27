
-- Composite services: rich component structure with per-item interval and price
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS service_components jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.services.service_components IS
  'Array ordenado de {service_id, interval_days, price} compondo um kit/tratamento combinado. Cada item gera um agendamento próprio.';

-- Backfill from legacy component_service_ids if present
UPDATE public.services s
SET service_components = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'service_id', cid,
        'interval_days', CASE WHEN ord = 1 THEN 0 ELSE 7 END,
        'price', COALESCE((SELECT price FROM public.services WHERE id = cid::uuid), 0)
      )
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM unnest(s.component_service_ids) WITH ORDINALITY AS t(cid, ord)
)
WHERE array_length(s.component_service_ids, 1) > 0
  AND (s.service_components IS NULL OR s.service_components = '[]'::jsonb);

-- Composite chain tracking on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS composite_group_id uuid,
  ADD COLUMN IF NOT EXISTS composite_sequence_order integer;

CREATE INDEX IF NOT EXISTS idx_appointments_composite_group
  ON public.appointments(composite_group_id)
  WHERE composite_group_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.composite_group_id IS
  'Agrupa agendamentos gerados a partir de um mesmo serviço composto (kit).';
COMMENT ON COLUMN public.appointments.composite_sequence_order IS
  'Ordem (1-based) do agendamento dentro do kit composto.';

-- Cascade rescheduling trigger: when a composite appointment moves, shift subsequent ones by the same delta
CREATE OR REPLACE FUNCTION public.cascade_composite_reschedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta_ms bigint;
BEGIN
  IF NEW.composite_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.start_time IS DISTINCT FROM NEW.start_time
     AND NEW.status <> 'cancelled'
     AND COALESCE(current_setting('app.skip_composite_cascade', true), '') <> 'on'
  THEN
    delta_ms := EXTRACT(EPOCH FROM (NEW.start_time - OLD.start_time)) * 1000;

    -- Prevent recursion within the same statement chain
    PERFORM set_config('app.skip_composite_cascade', 'on', true);

    UPDATE public.appointments
       SET start_time = start_time + make_interval(secs => delta_ms / 1000.0),
           end_time   = end_time   + make_interval(secs => delta_ms / 1000.0),
           updated_at = now()
     WHERE composite_group_id = NEW.composite_group_id
       AND composite_sequence_order > NEW.composite_sequence_order
       AND status <> 'cancelled';

    PERFORM set_config('app.skip_composite_cascade', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_composite_reschedule ON public.appointments;
CREATE TRIGGER trg_cascade_composite_reschedule
AFTER UPDATE OF start_time ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.cascade_composite_reschedule();
