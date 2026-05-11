CREATE OR REPLACE FUNCTION public.recalculate_package_minimum_intervals(_package_appointment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_id uuid;
  v_package_interval integer;
  v_min_days integer := 21;
  v_started boolean := false;
  v_previous_start timestamptz := NULL;
  v_previous_interval integer := NULL;
  v_updates integer := 0;
  v_interval_from_previous integer;
  v_required_date date;
  v_target_time time;
  v_effective_start timestamptz;
  v_new_start timestamptz;
  v_duration interval;
  v_gap_days integer;
  v_is_mutable boolean;
  rec record;
BEGIN
  SELECT pa.package_id,
         GREATEST(v_min_days, COALESCE(NULLIF(sp.interval_days, 0), v_min_days))
    INTO v_package_id, v_package_interval
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE pa.id = _package_appointment_id;

  IF v_package_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR rec IN
    SELECT
      pa.id,
      pa.appointment_id,
      pa.scheduled_date,
      pa.status AS package_status,
      pa.interval_after_days,
      COALESCE(pa.sequence_order, pa.session_number) AS session_order,
      a.start_time AS appointment_start_time,
      a.end_time AS appointment_end_time,
      a.status::text AS appointment_status,
      sp.duration AS package_duration,
      svc.duration AS service_duration
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, a.service_id, sp.service_id)
    WHERE pa.package_id = v_package_id
    ORDER BY COALESCE(pa.sequence_order, pa.session_number), pa.created_at, pa.id
  LOOP
    v_effective_start := COALESCE(rec.appointment_start_time, rec.scheduled_date);
    v_new_start := v_effective_start;
    v_is_mutable := COALESCE(rec.package_status, 'scheduled') NOT IN ('completed', 'missed', 'cancelled', 'rescheduled')
      AND COALESCE(rec.appointment_status, 'scheduled') NOT IN ('completed', 'missed', 'cancelled', 'rescheduled');

    IF rec.id = _package_appointment_id THEN
      v_started := true;
    END IF;

    IF v_started AND v_previous_start IS NOT NULL THEN
      v_interval_from_previous := GREATEST(v_min_days, COALESCE(NULLIF(v_previous_interval, 0), v_package_interval, v_min_days));
      v_required_date := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::date + v_interval_from_previous;

      IF v_effective_start IS NULL THEN
        v_target_time := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::time;
        v_new_start := (v_required_date::timestamp + v_target_time) AT TIME ZONE 'America/Sao_Paulo';
      ELSE
        v_gap_days := (v_effective_start AT TIME ZONE 'America/Sao_Paulo')::date - (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::date;
        v_target_time := CASE
          WHEN rec.id = _package_appointment_id THEN (v_effective_start AT TIME ZONE 'America/Sao_Paulo')::time
          ELSE (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::time
        END;

        IF rec.id <> _package_appointment_id OR v_gap_days < v_interval_from_previous THEN
          v_new_start := (v_required_date::timestamp + v_target_time) AT TIME ZONE 'America/Sao_Paulo';
        END IF;
      END IF;

      IF v_is_mutable AND v_new_start IS NOT NULL AND (v_effective_start IS NULL OR v_new_start IS DISTINCT FROM v_effective_start) THEN
        v_duration := CASE
          WHEN rec.appointment_start_time IS NOT NULL AND rec.appointment_end_time IS NOT NULL
            THEN rec.appointment_end_time - rec.appointment_start_time
          ELSE make_interval(mins => GREATEST(1, COALESCE(rec.service_duration, rec.package_duration, 60))::integer)
        END;

        UPDATE public.package_appointments
        SET scheduled_date = v_new_start,
            status = CASE WHEN status IN ('pending', 'rescheduled') THEN 'scheduled' ELSE status END,
            updated_at = now()
        WHERE id = rec.id
          AND (scheduled_date IS DISTINCT FROM v_new_start OR status IN ('pending', 'rescheduled'));

        IF rec.appointment_id IS NOT NULL THEN
          UPDATE public.appointments
          SET start_time = v_new_start,
              end_time = v_new_start + v_duration,
              status = CASE WHEN status = 'rescheduled' THEN 'scheduled' ELSE status END,
              updated_at = now()
          WHERE id = rec.appointment_id
            AND status::text NOT IN ('completed', 'missed', 'cancelled')
            AND (start_time IS DISTINCT FROM v_new_start OR end_time IS DISTINCT FROM v_new_start + v_duration OR status = 'rescheduled');
        END IF;

        v_effective_start := v_new_start;
        v_updates := v_updates + 1;
      END IF;
    END IF;

    IF v_effective_start IS NOT NULL THEN
      v_previous_start := v_effective_start;
    END IF;
    v_previous_interval := rec.interval_after_days;
  END LOOP;

  RETURN v_updates;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_package_minimum_interval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_interval integer;
BEGIN
  SELECT interval_days INTO v_package_interval
  FROM public.service_packages
  WHERE id = NEW.package_id;

  NEW.interval_after_days := GREATEST(21, COALESCE(NULLIF(NEW.interval_after_days, 0), v_package_interval, 21));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cascade_package_interval_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.skip_package_interval_cascade', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.package_appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.package_appointment_id IS NOT DISTINCT FROM OLD.package_appointment_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.recalculate_package_minimum_intervals(NEW.package_appointment_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cascade_package_interval_from_package_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.skip_package_interval_cascade', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date
     AND NEW.appointment_id IS NOT DISTINCT FROM OLD.appointment_id
     AND NEW.interval_after_days IS NOT DISTINCT FROM OLD.interval_after_days
     AND COALESCE(NEW.sequence_order, NEW.session_number) IS NOT DISTINCT FROM COALESCE(OLD.sequence_order, OLD.session_number) THEN
    RETURN NEW;
  END IF;

  PERFORM public.recalculate_package_minimum_intervals(NEW.id);
  RETURN NEW;
END;
$$;

SELECT set_config('app.skip_package_interval_cascade', 'on', true);

UPDATE public.package_appointments pa
SET interval_after_days = GREATEST(21, COALESCE(NULLIF(pa.interval_after_days, 0), sp.interval_days, 21)),
    updated_at = now()
FROM public.service_packages sp
WHERE sp.id = pa.package_id
  AND pa.interval_after_days IS DISTINCT FROM GREATEST(21, COALESCE(NULLIF(pa.interval_after_days, 0), sp.interval_days, 21));

UPDATE public.package_appointments pa
SET scheduled_date = a.start_time,
    status = CASE a.status
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'rescheduled' THEN 'rescheduled'
      WHEN 'confirmed' THEN 'scheduled'
      WHEN 'scheduled' THEN 'scheduled'
      ELSE pa.status
    END,
    updated_at = now()
FROM public.appointments a
WHERE pa.appointment_id = a.id
  AND (pa.scheduled_date IS DISTINCT FROM a.start_time
       OR pa.status IS DISTINCT FROM CASE a.status
        WHEN 'completed' THEN 'completed'
        WHEN 'missed' THEN 'missed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'rescheduled' THEN 'rescheduled'
        WHEN 'confirmed' THEN 'scheduled'
        WHEN 'scheduled' THEN 'scheduled'
        ELSE pa.status
       END);

DO $$
DECLARE
  rec record;
BEGIN
  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);

  FOR rec IN
    SELECT DISTINCT ON (pa.package_id) pa.id
    FROM public.package_appointments pa
    WHERE pa.scheduled_date IS NOT NULL OR pa.appointment_id IS NOT NULL
    ORDER BY pa.package_id, COALESCE(pa.sequence_order, pa.session_number), pa.created_at, pa.id
  LOOP
    PERFORM public.recalculate_package_minimum_intervals(rec.id);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS normalize_package_minimum_interval_trigger ON public.package_appointments;
CREATE TRIGGER normalize_package_minimum_interval_trigger
BEFORE INSERT OR UPDATE OF package_id, interval_after_days
ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.normalize_package_minimum_interval();

DROP TRIGGER IF EXISTS trg_cascade_package_interval_from_appointment ON public.appointments;
CREATE TRIGGER trg_cascade_package_interval_from_appointment
AFTER INSERT OR UPDATE OF start_time, package_appointment_id
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.cascade_package_interval_from_appointment();

DROP TRIGGER IF EXISTS trg_cascade_package_interval_from_package_appointment ON public.package_appointments;
CREATE TRIGGER trg_cascade_package_interval_from_package_appointment
AFTER INSERT OR UPDATE OF scheduled_date, appointment_id, interval_after_days, sequence_order
ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.cascade_package_interval_from_package_appointment();