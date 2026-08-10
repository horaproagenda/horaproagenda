CREATE OR REPLACE FUNCTION public.tg_block_non_working_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_tz text := 'America/Sao_Paulo';
  v_work_sun boolean := true;
  v_work_sat boolean := true;
  v_pref_sun boolean;
  v_pref_sat boolean;
  v_dow int;
BEGIN
  IF NEW.status IN ('cancelled', 'rescheduled', 'missed') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.start_time = OLD.start_time THEN
    RETURN NEW;
  END IF;

  v_owner := NEW.account_owner_id;
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(bs.timezone, 'America/Sao_Paulo'),
         COALESCE(bs.work_sundays, false),
         COALESCE(bs.work_saturdays, true)
    INTO v_tz, v_work_sun, v_work_sat
  FROM public.business_settings bs
  WHERE bs.account_owner_id = v_owner
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.professional_id IS NOT NULL THEN
    SELECT pp.work_sundays, pp.work_saturdays
      INTO v_pref_sun, v_pref_sat
    FROM public.professional_preferences pp
    WHERE pp.professional_id = NEW.professional_id
    LIMIT 1;

    IF v_pref_sun IS NOT NULL THEN v_work_sun := v_pref_sun; END IF;
    IF v_pref_sat IS NOT NULL THEN v_work_sat := v_pref_sat; END IF;
  END IF;

  v_dow := EXTRACT(dow FROM (NEW.start_time AT TIME ZONE v_tz))::int;

  IF v_dow = 0 AND NOT v_work_sun THEN
    RAISE EXCEPTION 'O estabelecimento não atende aos domingos. Escolha outra data para este agendamento.';
  END IF;

  IF v_dow = 6 AND NOT v_work_sat THEN
    RAISE EXCEPTION 'O estabelecimento não atende aos sábados. Escolha outra data para este agendamento.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_non_working_days ON public.appointments;
CREATE TRIGGER trg_block_non_working_days
BEFORE INSERT OR UPDATE OF start_time, end_time, professional_id, status
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.tg_block_non_working_days();