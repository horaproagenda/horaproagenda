
-- Add an "outcome mode" GUC respected by package sync triggers so the client
-- can choose between releasing the package session or consuming it
-- (regardless of whether the appointment is being marked as 'cancelled' or 'missed').

CREATE OR REPLACE FUNCTION public.release_package_session_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_package_id uuid;
  v_mode text;
BEGIN
  v_mode := NULLIF(current_setting('app.package_outcome_mode', true), '');

  IF TG_OP = 'UPDATE'
     AND OLD.package_appointment_id IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    -- Explicit consume requested: keep package link, do not release.
    IF v_mode = 'consume' THEN
      RETURN NEW;
    END IF;

    -- Either explicit release, or default behaviour for cancelled/rescheduled.
    IF v_mode = 'release'
       OR NEW.status::text IN ('cancelled', 'rescheduled') THEN

      UPDATE public.package_appointments pa
      SET appointment_id = NULL,
          scheduled_date = NULL,
          status = 'pending',
          updated_at = now()
      WHERE pa.id = OLD.package_appointment_id
      RETURNING pa.package_id INTO v_package_id;

      PERFORM public.recount_service_package_sessions(v_package_id);

      NEW.package_appointment_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_package_appointment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pa_id uuid;
  v_package_id uuid;
  v_new_status text;
  v_mode text;
BEGIN
  v_pa_id := NEW.package_appointment_id;
  IF v_pa_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_mode := NULLIF(current_setting('app.package_outcome_mode', true), '');

  -- Explicit release path: clear pa link & mark pending. Already handled in BEFORE trigger when applicable,
  -- but in case package_appointment_id is still set here, mirror the behaviour.
  IF v_mode = 'release' THEN
    UPDATE public.package_appointments pa
    SET appointment_id = NULL,
        scheduled_date = NULL,
        status = 'pending',
        updated_at = now()
    WHERE pa.id = v_pa_id
    RETURNING pa.package_id INTO v_package_id;
    PERFORM public.recount_service_package_sessions(v_package_id);
    RETURN NEW;
  END IF;

  -- Explicit consume path: keep link, set pa status reflecting the outcome.
  IF v_mode = 'consume' THEN
    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'missed'
      WHEN 'rescheduled' THEN 'missed'
      ELSE 'scheduled'
    END;

    UPDATE public.package_appointments pa
    SET appointment_id = COALESCE(pa.appointment_id, NEW.id),
        status = v_new_status,
        scheduled_date = COALESCE(NEW.start_time, pa.scheduled_date),
        updated_at = now()
    WHERE pa.id = v_pa_id
    RETURNING pa.package_id INTO v_package_id;

    PERFORM public.recount_service_package_sessions(v_package_id);
    RETURN NEW;
  END IF;

  -- Default behaviour (no mode specified).
  IF NEW.status::text IN ('cancelled', 'rescheduled') THEN
    UPDATE public.package_appointments pa
    SET appointment_id = NULL,
        scheduled_date = NULL,
        status = 'pending',
        updated_at = now()
    WHERE pa.id = v_pa_id
    RETURNING pa.package_id INTO v_package_id;

    PERFORM public.recount_service_package_sessions(v_package_id);
    RETURN NEW;
  END IF;

  v_new_status := CASE NEW.status::text
    WHEN 'completed' THEN 'completed'
    WHEN 'missed' THEN 'missed'
    WHEN 'confirmed' THEN 'scheduled'
    WHEN 'scheduled' THEN 'scheduled'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    UPDATE public.package_appointments
    SET appointment_id = COALESCE(appointment_id, NEW.id),
        scheduled_date = COALESCE(NEW.start_time, scheduled_date),
        updated_at = now()
    WHERE id = v_pa_id
      AND (
        appointment_id IS DISTINCT FROM COALESCE(appointment_id, NEW.id)
        OR scheduled_date IS DISTINCT FROM COALESCE(NEW.start_time, scheduled_date)
      );
    RETURN NEW;
  END IF;

  UPDATE public.package_appointments pa
  SET appointment_id = NEW.id,
      status = v_new_status,
      scheduled_date = COALESCE(NEW.start_time, scheduled_date),
      updated_at = now()
  WHERE pa.id = v_pa_id
    AND (
      pa.appointment_id IS DISTINCT FROM NEW.id
      OR pa.status IS DISTINCT FROM v_new_status
      OR pa.scheduled_date IS DISTINCT FROM COALESCE(NEW.start_time, pa.scheduled_date)
    )
  RETURNING pa.package_id INTO v_package_id;

  PERFORM public.recount_service_package_sessions(v_package_id);
  RETURN NEW;
END;
$function$;

-- RPC the client uses to atomically set the outcome mode + appointment status in one transaction.
CREATE OR REPLACE FUNCTION public.set_appointment_status_with_package_mode(
  p_appointment_id uuid,
  p_status text,
  p_mode text,
  p_expected_version integer DEFAULT NULL
)
 RETURNS public.appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.appointments;
BEGIN
  IF p_mode IS NOT NULL AND p_mode NOT IN ('release','consume') THEN
    RAISE EXCEPTION 'Invalid package outcome mode: %', p_mode;
  END IF;

  IF p_mode IS NOT NULL THEN
    PERFORM set_config('app.package_outcome_mode', p_mode, true);
  END IF;

  IF p_expected_version IS NOT NULL THEN
    UPDATE public.appointments
    SET status = p_status::appointment_status
    WHERE id = p_appointment_id
      AND version = p_expected_version
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Appointment version mismatch or not found' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    UPDATE public.appointments
    SET status = p_status::appointment_status
    WHERE id = p_appointment_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_appointment_status_with_package_mode(uuid, text, text, integer) TO authenticated;
