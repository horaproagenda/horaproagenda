CREATE OR REPLACE FUNCTION public.sync_package_appointment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pa_id uuid;
  v_new_status text;
BEGIN
  v_pa_id := NEW.package_appointment_id;
  IF v_pa_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_status := CASE NEW.status
    WHEN 'completed' THEN 'completed'
    WHEN 'missed' THEN 'missed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'rescheduled' THEN 'rescheduled'
    WHEN 'confirmed' THEN 'scheduled'
    WHEN 'scheduled' THEN 'scheduled'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    UPDATE public.package_appointments
    SET scheduled_date = COALESCE(NEW.start_time, scheduled_date),
        updated_at = now()
    WHERE id = v_pa_id
      AND scheduled_date IS DISTINCT FROM COALESCE(NEW.start_time, scheduled_date);
    RETURN NEW;
  END IF;

  UPDATE public.package_appointments
  SET status = v_new_status,
      scheduled_date = COALESCE(NEW.start_time, scheduled_date),
      updated_at = now()
  WHERE id = v_pa_id
    AND (
      status IS DISTINCT FROM v_new_status
      OR scheduled_date IS DISTINCT FROM COALESCE(NEW.start_time, scheduled_date)
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_package_appointment_status ON public.appointments;
CREATE TRIGGER trg_sync_package_appointment_status
AFTER INSERT OR UPDATE OF status, package_appointment_id, start_time
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_package_appointment_status();