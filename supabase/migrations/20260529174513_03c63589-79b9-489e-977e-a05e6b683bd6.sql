
CREATE OR REPLACE FUNCTION public.sync_recurring_session_notes(p_recurring_group_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_recurring_group_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH ordered AS (
    SELECT
      a.id,
      ROW_NUMBER() OVER (ORDER BY a.start_time ASC, a.created_at ASC, a.id ASC) AS session_index,
      COUNT(*) OVER () AS session_total
    FROM public.appointments a
    WHERE a.recurring_group_id = p_recurring_group_id
      AND a.status NOT IN ('cancelled'::appointment_status, 'rescheduled'::appointment_status)
  ), prepared AS (
    SELECT
      a.id,
      CASE
        WHEN COALESCE(a.notes, '') ~* 'Sessão\s+\d+\s+de\s+\d+'
          THEN regexp_replace(
            COALESCE(a.notes, ''),
            'Sessão\s+\d+\s+de\s+\d+',
            'Sessão ' || o.session_index || ' de ' || o.session_total,
            'i'
          )
        WHEN COALESCE(a.notes, '') = ''
          THEN 'Sessão ' || o.session_index || ' de ' || o.session_total
        ELSE a.notes || ' - Sessão ' || o.session_index || ' de ' || o.session_total
      END AS new_notes
    FROM public.appointments a
    JOIN ordered o ON o.id = a.id
  )
  UPDATE public.appointments a
     SET notes = p.new_notes,
         updated_at = now()
    FROM prepared p
   WHERE a.id = p.id
     AND a.notes IS DISTINCT FROM p.new_notes;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_recurring_session_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.recurring_group_id IS NOT NULL THEN
    PERFORM public.sync_recurring_session_notes(NEW.recurring_group_id);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.recurring_group_id IS NOT NULL
     AND OLD.recurring_group_id IS DISTINCT FROM NEW.recurring_group_id THEN
    PERFORM public.sync_recurring_session_notes(OLD.recurring_group_id);
  END IF;

  IF TG_OP = 'DELETE' AND OLD.recurring_group_id IS NOT NULL THEN
    PERFORM public.sync_recurring_session_notes(OLD.recurring_group_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_recurring_session_notes ON public.appointments;
CREATE TRIGGER trg_sync_recurring_session_notes
AFTER INSERT OR UPDATE OF recurring_group_id, start_time, status, notes OR DELETE
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_recurring_session_notes();

SELECT public.sync_recurring_session_notes(recurring_group_id)
FROM (
  SELECT DISTINCT recurring_group_id
  FROM public.appointments
  WHERE recurring_group_id IS NOT NULL
) recurring_groups;
