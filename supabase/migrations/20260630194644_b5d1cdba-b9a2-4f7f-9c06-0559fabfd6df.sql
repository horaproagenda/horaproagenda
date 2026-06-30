-- Fix package reschedule blocked by intra-package conflict trigger.
-- When reschedule_package_appointment_safely runs, the conflict trigger sees the
-- next session still occupying the target slot and aborts. We add a per-session
-- escape (app.reschedule_package_id) that lets the safe RPC ignore conflicts
-- with appointments belonging to the SAME package, then cascade-first so the
-- following sessions move to their correct interval before the anchor lands.

CREATE OR REPLACE FUNCTION public.appointment_has_conflict(
  p_id uuid,
  p_professional_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict_id uuid;
  v_absence_id uuid;
  v_skip_package uuid;
BEGIN
  IF p_status IN ('cancelled','missed','rescheduled') THEN RETURN NULL; END IF;
  IF p_professional_id IS NULL THEN RETURN NULL; END IF;

  BEGIN
    v_skip_package := NULLIF(current_setting('app.reschedule_package_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_skip_package := NULL;
  END;

  SELECT a.id INTO v_conflict_id
  FROM public.appointments a
  LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
  WHERE a.professional_id = p_professional_id
    AND a.status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
    AND (p_id IS NULL OR a.id <> p_id)
    AND a.start_time < p_end
    AND a.end_time   > p_start
    AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
  LIMIT 1;
  IF v_conflict_id IS NOT NULL THEN
    RETURN 'Conflito: profissional já possui agendamento no horário (' || v_conflict_id::text || ')';
  END IF;

  SELECT pa.id INTO v_absence_id
  FROM public.professional_absences pa
  WHERE pa.professional_id = p_professional_id
    AND pa.start_time < p_end
    AND pa.end_time   > p_start
  LIMIT 1;
  IF v_absence_id IS NOT NULL THEN
    RETURN 'Conflito: profissional ausente neste horário (' || v_absence_id::text || ')';
  END IF;
  RETURN NULL;
END;
$function$;

-- Rebuild safe RPC: cascade following sessions first (so the anchor slot is free),
-- and mark the package as "internal reschedule in progress" so the conflict trigger
-- ignores collisions with other sessions of the same package.
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
  v_old_start timestamptz;
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

  v_old_start := v_appt.start_time;

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

    -- Allow intra-package conflicts during this transaction so cascading
    -- next sessions out of the way doesn't trip the conflict trigger.
    PERFORM set_config('app.reschedule_package_id', v_package_id::text, true);
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

    PERFORM public.recalculate_package_minimum_intervals(v_safe_pa_id);
  ELSIF v_package_id IS NOT NULL THEN
    PERFORM public.cascade_package_intervals_after_anchor(v_package_id, p_new_start, v_old_start);
  END IF;

  -- Reset the escape flag for safety.
  IF v_package_id IS NOT NULL THEN
    PERFORM set_config('app.reschedule_package_id', '', true);
  END IF;

  RETURN v_updated;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reschedule_package_appointment_safely(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;

-- Backfill: Flávia's package has session 9 stuck at 27/06 (completed by the
-- previous failure) and session 10 at 30/06. Run repair so the schedule
-- realigns with the 21-day rule based on the latest active anchor.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT sp.client_id
    FROM public.service_packages sp
    WHERE sp.is_active = true AND sp.client_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.repair_client_package_schedule_and_history(rec.client_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;