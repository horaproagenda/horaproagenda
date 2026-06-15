
CREATE OR REPLACE FUNCTION public.preview_package_appointment_cascade(
  _appointment_id uuid,
  _new_start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source_pa public.package_appointments%ROWTYPE;
  v_pkg_id uuid;
  v_min_days integer := 21;
  v_pkg_interval integer;
  v_started boolean := false;
  v_previous_start timestamptz := NULL;
  v_previous_interval integer := NULL;
  v_interval_from_previous integer;
  v_required_date date;
  v_target_time time;
  v_effective_start timestamptz;
  v_new_start_calc timestamptz;
  v_duration interval;
  v_sessions jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_session_obj jsonb;
  v_conflict_count int;
  v_other_id uuid;
  v_other_label text;
  rec record;
BEGIN
  SELECT pa.* INTO v_source_pa
  FROM public.package_appointments pa
  WHERE pa.appointment_id = _appointment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão de pacote não encontrada');
  END IF;

  v_pkg_id := v_source_pa.package_id;

  SELECT GREATEST(v_min_days, COALESCE(NULLIF(sp.interval_days, 0), v_min_days))
    INTO v_pkg_interval
  FROM public.service_packages sp
  WHERE sp.id = v_pkg_id;

  FOR rec IN
    SELECT
      pa.id,
      pa.appointment_id,
      pa.scheduled_date,
      pa.status AS package_status,
      pa.interval_after_days,
      COALESCE(pa.sequence_order, pa.session_number) AS session_order,
      pa.session_number,
      a.start_time AS appointment_start_time,
      a.end_time AS appointment_end_time,
      a.status::text AS appointment_status,
      a.professional_id,
      a.room_id,
      a.client_id,
      sp.duration AS package_duration,
      svc.duration AS service_duration
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, a.service_id, sp.service_id)
    WHERE pa.package_id = v_pkg_id
    ORDER BY COALESCE(pa.sequence_order, pa.session_number), pa.created_at, pa.id
  LOOP
    -- For the source session, the effective start is the NEW one chosen by the user
    IF rec.appointment_id = _appointment_id THEN
      v_started := true;
      v_effective_start := _new_start;
      v_new_start_calc := _new_start;
    ELSE
      v_effective_start := COALESCE(rec.appointment_start_time, rec.scheduled_date);
      v_new_start_calc := v_effective_start;
    END IF;

    IF v_started AND v_previous_start IS NOT NULL AND rec.appointment_id <> _appointment_id THEN
      v_interval_from_previous := GREATEST(v_min_days, COALESCE(NULLIF(v_previous_interval, 0), v_pkg_interval, v_min_days));
      v_required_date := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::date + v_interval_from_previous;
      v_target_time := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::time;
      v_new_start_calc := (v_required_date::timestamp + v_target_time) AT TIME ZONE 'America/Sao_Paulo';
    END IF;

    IF v_started THEN
      v_duration := CASE
        WHEN rec.appointment_start_time IS NOT NULL AND rec.appointment_end_time IS NOT NULL
          THEN rec.appointment_end_time - rec.appointment_start_time
        ELSE make_interval(mins => GREATEST(1, COALESCE(rec.service_duration, rec.package_duration, 60))::integer)
      END;

      -- Detect conflict: other non-cancelled appointment from same professional or same room overlapping
      v_other_id := NULL;
      v_other_label := NULL;
      IF rec.appointment_id IS NOT NULL THEN
        SELECT a2.id,
               COALESCE(c2.name, 'outro cliente') || ' — ' || to_char(a2.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
          INTO v_other_id, v_other_label
        FROM public.appointments a2
        LEFT JOIN public.clients c2 ON c2.id = a2.client_id
        WHERE a2.id <> rec.appointment_id
          AND a2.status::text NOT IN ('cancelled', 'rescheduled')
          AND (
            (rec.professional_id IS NOT NULL AND a2.professional_id = rec.professional_id)
            OR (rec.room_id IS NOT NULL AND a2.room_id = rec.room_id)
          )
          AND a2.start_time < (v_new_start_calc + v_duration)
          AND a2.end_time   > v_new_start_calc
        LIMIT 1;
      END IF;

      v_session_obj := jsonb_build_object(
        'package_appointment_id', rec.id,
        'appointment_id', rec.appointment_id,
        'session_number', rec.session_number,
        'is_source', (rec.appointment_id = _appointment_id),
        'current_start', rec.appointment_start_time,
        'new_start', v_new_start_calc,
        'new_end', v_new_start_calc + v_duration,
        'is_mutable', (
          COALESCE(rec.package_status, 'scheduled') NOT IN ('completed', 'missed', 'cancelled', 'rescheduled')
          AND COALESCE(rec.appointment_status, 'scheduled') NOT IN ('completed', 'missed', 'cancelled', 'rescheduled')
        ),
        'conflict', (v_other_id IS NOT NULL),
        'conflict_with', v_other_label
      );
      v_sessions := v_sessions || v_session_obj;

      IF v_other_id IS NOT NULL THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'date', to_char(v_new_start_calc AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
          'time', to_char(v_new_start_calc AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
          'session_number', rec.session_number,
          'with', v_other_label
        );
      END IF;

      v_previous_start := v_new_start_calc;
    END IF;

    v_previous_interval := rec.interval_after_days;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sessions', v_sessions,
    'conflicts', v_conflicts
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.preview_package_appointment_cascade(uuid, timestamptz) TO authenticated, service_role;
