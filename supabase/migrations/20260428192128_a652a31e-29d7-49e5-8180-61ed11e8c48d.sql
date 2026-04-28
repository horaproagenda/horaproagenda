CREATE OR REPLACE FUNCTION public.validate_package_step_interval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total_steps INTEGER;
  v_package_type TEXT;
BEGIN
  IF TG_TABLE_NAME = 'package_template_steps' THEN
    SELECT COUNT(*) INTO v_total_steps
    FROM public.package_template_steps
    WHERE template_id = NEW.template_id
      AND id IS DISTINCT FROM NEW.id;

    IF NEW.sequence_order IS NULL OR NEW.sequence_order < 1 THEN
      RAISE EXCEPTION 'A etapa do pacote precisa ter uma ordem válida.';
    END IF;

    IF NEW.service_id IS NULL THEN
      RAISE EXCEPTION 'Cada etapa do pacote precisa ter um serviço vinculado.';
    END IF;

    IF COALESCE(NEW.interval_after_days, 0) <= 0 AND NEW.sequence_order <= v_total_steps THEN
      RAISE EXCEPTION 'Informe um intervalo em dias entre as etapas do pacote.';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'package_appointments' THEN
    SELECT package_type INTO v_package_type
    FROM public.service_packages
    WHERE id = NEW.package_id;

    IF COALESCE(v_package_type, 'standard') <> 'sequential' THEN
      RETURN NEW;
    END IF;

    IF NEW.sequence_order IS NULL OR NEW.sequence_order < 1 THEN
      RAISE EXCEPTION 'A sessão do pacote precisa ter uma ordem válida.';
    END IF;

    IF COALESCE(NEW.interval_after_days, 0) <= 0 THEN
      SELECT COUNT(*) INTO v_total_steps
      FROM public.package_appointments
      WHERE package_id = NEW.package_id;

      IF NEW.sequence_order < GREATEST(v_total_steps, 1) THEN
        RAISE EXCEPTION 'Informe um intervalo em dias entre as etapas do pacote.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;