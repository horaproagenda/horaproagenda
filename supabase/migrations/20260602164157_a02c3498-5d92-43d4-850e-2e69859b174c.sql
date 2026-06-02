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
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.package_appointment_id IS NOT NULL
     AND NEW.status::text IN ('cancelled', 'rescheduled')
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    UPDATE public.package_appointments pa
    SET appointment_id = NULL,
        scheduled_date = NULL,
        status = 'pending',
        updated_at = now()
    WHERE pa.id = OLD.package_appointment_id
    RETURNING pa.package_id INTO v_package_id;

    PERFORM public.recount_service_package_sessions(v_package_id);

    -- A sessão volta a ficar disponível no pacote; o agendamento cancelado/reagendado fica como histórico independente.
    NEW.package_appointment_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_release_package_session_on_cancel ON public.appointments;
CREATE TRIGGER trg_release_package_session_on_cancel
BEFORE UPDATE OF status ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.release_package_session_on_cancel();

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
BEGIN
  v_pa_id := NEW.package_appointment_id;
  IF v_pa_id IS NULL THEN
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_agenda_package_integrity_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cancelled_linked integer := 0;
  v_cancelled_appointments_still_linked integer := 0;
  v_orphaned_package_links integer := 0;
  v_status_mismatches integer := 0;
  v_counter_mismatches integer := 0;
  v_package_room_only integer := 0;
BEGIN
  SELECT COUNT(*)::integer INTO v_cancelled_linked
  FROM public.package_appointments pa
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE a.status::text IN ('cancelled', 'rescheduled')
    AND (pa.status IS DISTINCT FROM 'pending' OR pa.scheduled_date IS NOT NULL OR pa.appointment_id IS NOT NULL);

  SELECT COUNT(*)::integer INTO v_cancelled_appointments_still_linked
  FROM public.appointments a
  WHERE a.status::text IN ('cancelled', 'rescheduled')
    AND a.package_appointment_id IS NOT NULL;

  SELECT COUNT(*)::integer INTO v_orphaned_package_links
  FROM public.package_appointments pa
  LEFT JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.appointment_id IS NOT NULL
    AND a.id IS NULL;

  SELECT COUNT(*)::integer INTO v_status_mismatches
  FROM public.package_appointments pa
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE (
    a.status::text IN ('completed', 'missed') AND pa.status IS DISTINCT FROM a.status::text
  ) OR (
    a.status::text IN ('scheduled', 'confirmed') AND pa.status IS DISTINCT FROM 'scheduled'
  );

  SELECT COUNT(*)::integer INTO v_counter_mismatches
  FROM public.service_packages sp
  LEFT JOIN (
    SELECT package_id,
           COUNT(*) FILTER (
             WHERE appointment_id IS NOT NULL
               AND COALESCE(status, 'pending') NOT IN ('pending', 'cancelled', 'rescheduled')
           )::integer AS expected_count
    FROM public.package_appointments
    GROUP BY package_id
  ) counts ON counts.package_id = sp.id
  WHERE sp.sessions_scheduled IS DISTINCT FROM COALESCE(counts.expected_count, 0);

  SELECT COUNT(*)::integer INTO v_package_room_only
  FROM public.appointments a
  WHERE a.package_appointment_id IS NOT NULL
    AND a.service_id IS NULL
    AND a.room_id IS NOT NULL
    AND a.status::text NOT IN ('cancelled', 'rescheduled');

  RETURN jsonb_build_object(
    'cancelledLinkedPackageSessions', v_cancelled_linked,
    'cancelledAppointmentsStillLinked', v_cancelled_appointments_still_linked,
    'orphanedPackageLinks', v_orphaned_package_links,
    'statusMismatches', v_status_mismatches,
    'counterMismatches', v_counter_mismatches,
    'packageAppointmentsUsingAppointmentRoomOnly', v_package_room_only,
    'checkedAt', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_agenda_package_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_released integer := 0;
  v_unlinked_cancelled integer := 0;
  v_orphans_fixed integer := 0;
  v_status_fixed integer := 0;
  v_counters_fixed integer := 0;
  rec record;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Apenas administradores ou recepção podem reparar integridade da agenda.';
  END IF;

  WITH targets AS (
    SELECT pa.id, pa.package_id
    FROM public.package_appointments pa
    JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE a.status::text IN ('cancelled', 'rescheduled')
  ), upd AS (
    UPDATE public.package_appointments pa
    SET appointment_id = NULL,
        scheduled_date = NULL,
        status = 'pending',
        updated_at = now()
    FROM targets t
    WHERE pa.id = t.id
    RETURNING pa.package_id
  )
  SELECT COUNT(*)::integer INTO v_released FROM upd;

  UPDATE public.appointments a
  SET package_appointment_id = NULL,
      updated_at = now()
  WHERE a.status::text IN ('cancelled', 'rescheduled')
    AND a.package_appointment_id IS NOT NULL;
  GET DIAGNOSTICS v_unlinked_cancelled = ROW_COUNT;

  UPDATE public.package_appointments pa
  SET appointment_id = NULL,
      scheduled_date = NULL,
      status = 'pending',
      updated_at = now()
  WHERE pa.appointment_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = pa.appointment_id);
  GET DIAGNOSTICS v_orphans_fixed = ROW_COUNT;

  UPDATE public.package_appointments pa
  SET status = CASE
        WHEN a.status::text IN ('completed', 'missed') THEN a.status::text
        WHEN a.status::text IN ('scheduled', 'confirmed') THEN 'scheduled'
        ELSE pa.status
      END,
      scheduled_date = COALESCE(a.start_time, pa.scheduled_date),
      updated_at = now()
  FROM public.appointments a
  WHERE a.id = pa.appointment_id
    AND (
      (a.status::text IN ('completed', 'missed') AND pa.status IS DISTINCT FROM a.status::text)
      OR (a.status::text IN ('scheduled', 'confirmed') AND pa.status IS DISTINCT FROM 'scheduled')
      OR pa.scheduled_date IS DISTINCT FROM COALESCE(a.start_time, pa.scheduled_date)
    );
  GET DIAGNOSTICS v_status_fixed = ROW_COUNT;

  FOR rec IN SELECT id FROM public.service_packages LOOP
    PERFORM public.recount_service_package_sessions(rec.id);
  END LOOP;

  SELECT COUNT(*)::integer INTO v_counters_fixed
  FROM public.service_packages sp
  LEFT JOIN (
    SELECT package_id,
           COUNT(*) FILTER (
             WHERE appointment_id IS NOT NULL
               AND COALESCE(status, 'pending') NOT IN ('pending', 'cancelled', 'rescheduled')
           )::integer AS expected_count
    FROM public.package_appointments
    GROUP BY package_id
  ) counts ON counts.package_id = sp.id
  WHERE sp.sessions_scheduled IS DISTINCT FROM COALESCE(counts.expected_count, 0);

  RETURN jsonb_build_object(
    'releasedPackageSessions', v_released,
    'cancelledAppointmentsUnlinked', v_unlinked_cancelled,
    'orphanedLinksFixed', v_orphans_fixed,
    'statusMismatchesFixed', v_status_fixed,
    'remainingCounterMismatches', v_counters_fixed,
    'executedAt', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_agenda_package_integrity_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_agenda_package_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recount_service_package_sessions(uuid) TO authenticated, service_role;

-- Normaliza dados antigos já afetados pelo problema para que pacotes cancelados voltem a ter sessão disponível.
WITH targets AS (
  SELECT pa.id, pa.package_id
  FROM public.package_appointments pa
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE a.status::text IN ('cancelled', 'rescheduled')
), released AS (
  UPDATE public.package_appointments pa
  SET appointment_id = NULL,
      scheduled_date = NULL,
      status = 'pending',
      updated_at = now()
  FROM targets t
  WHERE pa.id = t.id
  RETURNING pa.package_id
)
UPDATE public.appointments a
SET package_appointment_id = NULL,
    updated_at = now()
WHERE a.status::text IN ('cancelled', 'rescheduled')
  AND a.package_appointment_id IS NOT NULL;

DO $do$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT id FROM public.service_packages LOOP
    PERFORM public.recount_service_package_sessions(rec.id);
  END LOOP;
END;
$do$;