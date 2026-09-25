DROP TRIGGER IF EXISTS trg_cascade_package_interval_from_appointment ON public.appointments;
DROP TRIGGER IF EXISTS trg_cascade_package_interval_from_package_appointment ON public.package_appointments;

CREATE OR REPLACE FUNCTION public.normalize_package_minimum_interval()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_package_interval integer;
BEGIN
  IF COALESCE(NEW.interval_after_days, 0) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT interval_days INTO v_package_interval FROM public.service_packages WHERE id = NEW.package_id;
  NEW.interval_after_days := NULLIF(v_package_interval, 0);
  RETURN NEW;
END;
$$;