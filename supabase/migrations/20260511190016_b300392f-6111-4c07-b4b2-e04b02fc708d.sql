
-- 1) Trigger: keep package_appointments.status in sync with appointments.status
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

  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Map appointment status -> package_appointment status
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
    RETURN NEW;
  END IF;

  UPDATE public.package_appointments
  SET status = v_new_status,
      scheduled_date = COALESCE(NEW.start_time, scheduled_date),
      updated_at = now()
  WHERE id = v_pa_id
    AND status IS DISTINCT FROM v_new_status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_package_appointment_status ON public.appointments;
CREATE TRIGGER trg_sync_package_appointment_status
AFTER INSERT OR UPDATE OF status, package_appointment_id, start_time
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_package_appointment_status();

-- 2) Backfill: any package_appointment whose linked appointment is in a final state
UPDATE public.package_appointments pa
SET status = CASE a.status
              WHEN 'completed' THEN 'completed'
              WHEN 'missed' THEN 'missed'
              WHEN 'cancelled' THEN 'cancelled'
              WHEN 'rescheduled' THEN 'rescheduled'
              ELSE pa.status
            END,
    scheduled_date = COALESCE(a.start_time, pa.scheduled_date),
    updated_at = now()
FROM public.appointments a
WHERE pa.appointment_id = a.id
  AND a.status IN ('completed','missed','cancelled','rescheduled')
  AND pa.status IS DISTINCT FROM CASE a.status
    WHEN 'completed' THEN 'completed'
    WHEN 'missed' THEN 'missed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'rescheduled' THEN 'rescheduled'
  END;

-- 3) Ensure realtime publication includes the relevant tables for products
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_purchases;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_product_consumption;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
