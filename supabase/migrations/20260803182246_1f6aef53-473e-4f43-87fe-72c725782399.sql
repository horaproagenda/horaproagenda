CREATE OR REPLACE FUNCTION public.cascade_package_interval_from_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Time-only change (same calendar day) must NOT re-derive the dates of the
  -- following sessions: those dates were chosen by the professional/client.
  IF TG_OP = 'UPDATE'
     AND NEW.package_appointment_id IS NOT DISTINCT FROM OLD.package_appointment_id
     AND OLD.start_time IS NOT NULL
     AND NEW.start_time IS NOT NULL
     AND (OLD.start_time AT TIME ZONE 'America/Sao_Paulo')::date
         = (NEW.start_time AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN NEW;
  END IF;

  PERFORM public.recalculate_package_minimum_intervals(NEW.package_appointment_id);
  RETURN NEW;
END;
$function$;