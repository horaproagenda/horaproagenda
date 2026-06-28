CREATE OR REPLACE FUNCTION public.cascade_package_intervals_after_anchor(
  _package_id uuid,
  _anchor_start timestamptz,
  _from_start timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_interval integer;
  v_min_days integer := 21;
  v_previous_start timestamptz := _anchor_start;
  v_interval_from_previous integer;
  v_required_date date;
  v_target_time time;
  v_new_start timestamptz;
  v_duration interval;
  v_updates integer := 0;
  rec record;
BEGIN
  IF _package_id IS NULL OR _anchor_start IS NULL THEN
    RETURN 0;
  END IF;

  SELECT GREATEST(v_min_days, COALESCE(NULLIF(interval_days, 0), v_min_days))
    INTO v_package_interval
  FROM public.service_packages
  WHERE id = _package_id;

  v_package_interval := COALESCE(v_package_interval, v_min_days);

  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
  PERFORM set_config('app.skip_rebuild_pa', '1', true);

  FOR rec IN
    SELECT
      pa.id,
      pa.appointment_id,
      COALESCE(a.start_time, pa.scheduled_date) AS effective_start,
      a.end_time AS appointment_end_time,
      COALESCE(pa.interval_after_days, v_package_interval) AS interval_after_days,
      sp.duration AS package_duration,
      svc.duration AS service_duration
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, a.service_id, sp.service_id)
    WHERE pa.package_id = _package_id
      AND COALESCE(pa.status, 'pending') NOT IN ('completed', 'missed', 'cancelled')
      AND COALESCE(a.status::text, 'scheduled') NOT IN ('completed', 'missed', 'cancelled')
      AND COALESCE(a.start_time, pa.scheduled_date) IS NOT NULL
      AND COALESCE(a.start_time, pa.scheduled_date) > COALESCE(_from_start, _anchor_start)
    ORDER BY COALESCE(pa.sequence_order, pa.session_number), COALESCE(a.start_time, pa.scheduled_date), pa.created_at, pa.id
  LOOP
    v_interval_from_previous := GREATEST(v_min_days, COALESCE(NULLIF(rec.interval_after_days, 0), v_package_interval, v_min_days));
    v_required_date := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::date + v_interval_from_previous;
    v_target_time := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::time;
    v_new_start := (v_required_date::timestamp + v_target_time) AT TIME ZONE 'America/Sao_Paulo';

    v_duration := CASE
      WHEN rec.effective_start IS NOT NULL AND rec.appointment_end_time IS NOT NULL
        THEN rec.appointment_end_time - rec.effective_start
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

    v_previous_start := v_new_start;
    v_updates := v_updates + 1;
  END LOOP;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);

  PERFORM public.recount_service_package_sessions(_package_id);
  RETURN v_updates;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cascade_package_intervals_after_anchor(uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reschedule_package_appointment_safely(
  p_appointment_id uuid,
  p_new_start timestamptz,
  p_new_end timestamptz,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt public.appointments;
  v_updated public.appointments;
  v_package_id uuid;
  v_pa_id uuid;
  v_safe_pa_id uuid;
  v_service_id uuid;
  v_package_name text;
  v_service_name text;
  v_interval_updates integer;
BEGIN
  IF p_appointment_id IS NULL OR p_new_start IS NULL OR p_new_end IS NULL THEN
    RAISE EXCEPTION 'Dados de reagendamento incompletos';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  IF p_expected_version IS NOT NULL AND v_appt.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Appointment version mismatch or not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.package_appointment_id IS NOT NULL THEN
    SELECT pa.id, pa.package_id, COALESCE(pa.service_id, sp.service_id), sp.name, svc.name
      INTO v_pa_id, v_package_id, v_service_id, v_package_name, v_service_name
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, v_appt.service_id, sp.service_id)
    WHERE pa.id = v_appt.package_appointment_id;
  END IF;

  IF v_package_id IS NULL THEN
    SELECT h.package_id, h.package_appointment_id
      INTO v_package_id, v_pa_id
    FROM public.package_appointment_history h
    WHERE h.appointment_id = p_appointment_id
    ORDER BY h.created_at DESC
    LIMIT 1;
  END IF;

  IF v_package_id IS NULL THEN
    SELECT sp.id
      INTO v_package_id
    FROM public.service_packages sp
    WHERE sp.client_id = v_appt.client_id
      AND sp.is_active = true
      AND v_appt.notes IS NOT NULL
      AND lower(v_appt.notes) LIKE '%' || lower(sp.name) || '%'
    ORDER BY length(sp.name) DESC, sp.created_at DESC
    LIMIT 1;
  END IF;

  IF v_package_id IS NOT NULL THEN
    SELECT sp.name, COALESCE(svc.id, sp.service_id), svc.name
      INTO v_package_name, v_service_id, v_service_name
    FROM public.service_packages sp
    LEFT JOIN public.services svc ON svc.id = COALESCE(v_service_id, sp.service_id)
    WHERE sp.id = v_package_id;

    SELECT pa.id
      INTO v_safe_pa_id
    FROM public.package_appointments pa
    WHERE pa.package_id = v_package_id
      AND pa.id = v_pa_id
      AND (pa.appointment_id IS NULL OR pa.appointment_id = p_appointment_id)
    LIMIT 1;

    IF v_safe_pa_id IS NULL THEN
      SELECT pa.id
        INTO v_safe_pa_id
      FROM public.package_appointments pa
      WHERE pa.package_id = v_package_id
        AND pa.appointment_id IS NULL
        AND COALESCE(pa.status, 'pending') IN ('pending', 'scheduled', 'rescheduled')
      ORDER BY
        CASE WHEN pa.scheduled_date IS NULL THEN 1 ELSE 0 END,
        abs(extract(epoch from (COALESCE(pa.scheduled_date, p_new_start) - p_new_start))),
        COALESCE(pa.sequence_order, pa.session_number),
        pa.created_at
      LIMIT 1;
    END IF;
  END IF;

  UPDATE public.appointments
  SET start_time = p_new_start,
      end_time = p_new_end,
      status = 'scheduled'::public.appointment_status,
      package_appointment_id = COALESCE(v_safe_pa_id, package_appointment_id),
      service_id = COALESCE(service_id, v_service_id),
      service_name_snapshot = COALESCE(NULLIF(service_name_snapshot, ''), v_service_name),
      package_name_snapshot = COALESCE(NULLIF(package_name_snapshot, ''), v_package_name),
      updated_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_updated;

  IF v_safe_pa_id IS NOT NULL THEN
    UPDATE public.package_appointments
    SET appointment_id = p_appointment_id,
        scheduled_date = p_new_start,
        status = 'scheduled',
        service_id = COALESCE(service_id, v_service_id),
        updated_at = now()
    WHERE id = v_safe_pa_id;

    v_interval_updates := public.recalculate_package_minimum_intervals(v_safe_pa_id);
  ELSIF v_package_id IS NOT NULL THEN
    v_interval_updates := public.cascade_package_intervals_after_anchor(v_package_id, p_new_start, v_appt.start_time);
  END IF;

  RETURN v_updated;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reschedule_package_appointment_safely(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;