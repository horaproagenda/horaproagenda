CREATE OR REPLACE FUNCTION public.recount_service_package_sessions(_package_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _package_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.service_packages sp
  SET sessions_scheduled = GREATEST(0, COALESCE(sub.scheduled_count, 0)),
      updated_at = now()
  FROM (
    SELECT
      _package_id AS package_id,
      COUNT(*) FILTER (
        WHERE pa.appointment_id IS NOT NULL
          AND COALESCE(pa.status, 'pending') NOT IN ('pending', 'cancelled', 'rescheduled')
      )::integer AS scheduled_count
    FROM public.package_appointments pa
    WHERE pa.package_id = _package_id
  ) sub
  WHERE sp.id = sub.package_id
    AND sp.sessions_scheduled IS DISTINCT FROM GREATEST(0, COALESCE(sub.scheduled_count, 0));
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_package_session_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_id uuid;
  v_old_pa record;
  v_replacement_id uuid;
  v_mode text;
BEGIN
  v_mode := NULLIF(current_setting('app.package_outcome_mode', true), '');

  IF TG_OP = 'UPDATE'
     AND OLD.package_appointment_id IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    IF v_mode = 'consume' THEN
      RETURN NEW;
    END IF;

    IF v_mode = 'release'
       OR NEW.status::text IN ('cancelled', 'rescheduled') THEN

      SELECT pa.*, sp.total_sessions, sp.account_owner_id
      INTO v_old_pa
      FROM public.package_appointments pa
      JOIN public.service_packages sp ON sp.id = pa.package_id
      WHERE pa.id = OLD.package_appointment_id
      FOR UPDATE;

      IF FOUND THEN
        v_package_id := v_old_pa.package_id;

        UPDATE public.package_appointments pa
        SET appointment_id = NULL,
            scheduled_date = NULL,
            status = 'pending',
            updated_at = now()
        WHERE pa.id = OLD.package_appointment_id;

        INSERT INTO public.package_appointments (
          package_id,
          appointment_id,
          session_number,
          original_session_number,
          sequence_order,
          interval_after_days,
          scheduled_date,
          status,
          service_id,
          notes,
          account_owner_id
        ) VALUES (
          v_old_pa.package_id,
          NEW.id,
          v_old_pa.session_number,
          COALESCE(v_old_pa.original_session_number, v_old_pa.session_number),
          v_old_pa.sequence_order,
          v_old_pa.interval_after_days,
          NEW.start_time,
          NEW.status::text,
          v_old_pa.service_id,
          NULLIF(NEW.notes, ''),
          v_old_pa.account_owner_id
        )
        RETURNING id INTO v_replacement_id;

        NEW.package_appointment_id := v_replacement_id;
        PERFORM public.recount_service_package_sessions(v_package_id);
      END IF;
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

  SELECT pa.package_id INTO v_package_id
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE pa.id = v_pa_id AND sp.is_active = true;

  IF v_package_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_mode := NULLIF(current_setting('app.package_outcome_mode', true), '');

  IF v_mode = 'release' THEN
    UPDATE public.package_appointments pa
    SET status = COALESCE(NEW.status::text, 'cancelled'),
        scheduled_date = NEW.start_time,
        updated_at = now()
    WHERE pa.id = v_pa_id;
    PERFORM public.recount_service_package_sessions(v_package_id);
    RETURN NEW;
  END IF;

  IF v_mode = 'consume' THEN
    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'missed'
      WHEN 'rescheduled' THEN 'missed'
      ELSE 'scheduled'
    END;
  ELSE
    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'rescheduled' THEN 'rescheduled'
      WHEN 'confirmed' THEN 'scheduled'
      WHEN 'scheduled' THEN 'scheduled'
      ELSE 'scheduled'
    END;
  END IF;

  UPDATE public.package_appointments pa
  SET appointment_id = NEW.id,
      status = v_new_status,
      scheduled_date = NEW.start_time,
      updated_at = now()
  WHERE pa.id = v_pa_id
    AND (
      pa.appointment_id IS DISTINCT FROM NEW.id
      OR pa.status IS DISTINCT FROM v_new_status
      OR pa.scheduled_date IS DISTINCT FROM NEW.start_time
    )
  RETURNING pa.package_id INTO v_package_id;

  PERFORM public.recount_service_package_sessions(COALESCE(v_package_id, (SELECT package_id FROM public.package_appointments WHERE id = v_pa_id)));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_package_cancelled_history(_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  v_free_id uuid;
  v_fixed integer := 0;
  v_recounted integer := 0;
BEGIN
  FOR rec IN
    SELECT
      a.id AS appointment_id,
      a.client_id,
      a.start_time,
      a.status,
      a.notes,
      a.service_id,
      a.account_owner_id,
      sp.id AS package_id,
      sp.total_sessions,
      pa.id AS free_pa_id,
      pa.session_number,
      pa.original_session_number,
      pa.sequence_order,
      pa.interval_after_days,
      pa.service_id AS package_service_id,
      row_number() OVER (PARTITION BY a.id ORDER BY abs(extract(epoch from (COALESCE(pa.scheduled_date, a.start_time) - a.start_time))), COALESCE(pa.original_session_number, pa.session_number)) AS rn
    FROM public.appointments a
    JOIN public.service_packages sp
      ON sp.client_id = a.client_id
     AND sp.is_active = true
     AND a.notes IS NOT NULL
     AND lower(a.notes) LIKE '%' || lower(sp.name) || '%'
    JOIN public.package_appointments pa
      ON pa.package_id = sp.id
     AND pa.appointment_id IS NULL
    WHERE (_client_id IS NULL OR a.client_id = _client_id)
      AND a.status IN ('cancelled', 'rescheduled')
      AND a.package_appointment_id IS NULL
  LOOP
    IF rec.rn <> 1 THEN
      CONTINUE;
    END IF;

    UPDATE public.package_appointments
    SET appointment_id = rec.appointment_id,
        status = rec.status::text,
        scheduled_date = rec.start_time,
        service_id = COALESCE(service_id, rec.service_id, public.resolve_service_id_for_package(rec.package_id, COALESCE(rec.sequence_order, rec.session_number))),
        updated_at = now()
    WHERE id = rec.free_pa_id
    RETURNING id INTO v_free_id;

    UPDATE public.appointments
    SET package_appointment_id = v_free_id,
        service_id = COALESCE(service_id, rec.package_service_id, public.resolve_service_id_for_package(rec.package_id, COALESCE(rec.sequence_order, rec.session_number))),
        updated_at = now()
    WHERE id = rec.appointment_id;

    INSERT INTO public.package_appointments (
      package_id,
      appointment_id,
      session_number,
      original_session_number,
      sequence_order,
      interval_after_days,
      scheduled_date,
      status,
      service_id,
      notes,
      account_owner_id
    ) VALUES (
      rec.package_id,
      NULL,
      rec.session_number,
      COALESCE(rec.original_session_number, rec.session_number),
      rec.sequence_order,
      rec.interval_after_days,
      NULL,
      'pending',
      rec.package_service_id,
      'Sessão liberada automaticamente após cancelamento/reagendamento do histórico',
      rec.account_owner_id
    );

    PERFORM public.recount_service_package_sessions(rec.package_id);
    v_fixed := v_fixed + 1;
  END LOOP;

  FOR rec IN SELECT id FROM public.service_packages WHERE (_client_id IS NULL OR client_id = _client_id)
  LOOP
    PERFORM public.recount_service_package_sessions(rec.id);
    v_recounted := v_recounted + 1;
  END LOOP;

  RETURN jsonb_build_object('fixedCancelledHistory', v_fixed, 'packagesRecounted', v_recounted);
END;
$function$;

REVOKE ALL ON FUNCTION public.repair_package_cancelled_history(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.repair_package_cancelled_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_package_cancelled_history(uuid) TO service_role;

SELECT public.repair_package_cancelled_history(NULL);