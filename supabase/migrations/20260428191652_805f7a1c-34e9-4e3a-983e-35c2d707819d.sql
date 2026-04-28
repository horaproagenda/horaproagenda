CREATE TABLE IF NOT EXISTS public.package_appointment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_appointment_id UUID NOT NULL REFERENCES public.package_appointments(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  appointment_id UUID NULL,
  previous_scheduled_date TIMESTAMPTZ NULL,
  new_scheduled_date TIMESTAMPTZ NULL,
  previous_status TEXT NULL,
  new_status TEXT NULL,
  changed_by UUID NULL,
  change_reason TEXT NOT NULL DEFAULT 'Alteração de etapa do pacote',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.package_appointment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view package appointment history" ON public.package_appointment_history;
CREATE POLICY "Authenticated users can view package appointment history"
ON public.package_appointment_history
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create package appointment history" ON public.package_appointment_history;
CREATE POLICY "Authenticated users can create package appointment history"
ON public.package_appointment_history
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_package_appointment_history_session
ON public.package_appointment_history(package_appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_package_appointment_history_package
ON public.package_appointment_history(package_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_package_step_interval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total_steps INTEGER;
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

DROP TRIGGER IF EXISTS validate_package_template_step_interval_trigger ON public.package_template_steps;
CREATE TRIGGER validate_package_template_step_interval_trigger
BEFORE INSERT OR UPDATE ON public.package_template_steps
FOR EACH ROW
EXECUTE FUNCTION public.validate_package_step_interval();

DROP TRIGGER IF EXISTS validate_package_appointment_step_interval_trigger ON public.package_appointments;
CREATE TRIGGER validate_package_appointment_step_interval_trigger
BEFORE INSERT OR UPDATE ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.validate_package_step_interval();

CREATE OR REPLACE FUNCTION public.log_package_appointment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.package_appointment_history (
      package_appointment_id,
      package_id,
      appointment_id,
      new_scheduled_date,
      new_status,
      changed_by,
      change_reason,
      metadata
    ) VALUES (
      NEW.id,
      NEW.package_id,
      NEW.appointment_id,
      NEW.scheduled_date,
      NEW.status,
      auth.uid(),
      'Etapa criada',
      jsonb_build_object('sequence_order', NEW.sequence_order, 'session_number', NEW.session_number)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.appointment_id IS DISTINCT FROM NEW.appointment_id
    OR OLD.service_id IS DISTINCT FROM NEW.service_id
  ) THEN
    INSERT INTO public.package_appointment_history (
      package_appointment_id,
      package_id,
      appointment_id,
      previous_scheduled_date,
      new_scheduled_date,
      previous_status,
      new_status,
      changed_by,
      change_reason,
      metadata
    ) VALUES (
      NEW.id,
      NEW.package_id,
      NEW.appointment_id,
      OLD.scheduled_date,
      NEW.scheduled_date,
      OLD.status,
      NEW.status,
      auth.uid(),
      CASE
        WHEN OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date THEN 'Reagendamento de etapa'
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'Mudança de status da etapa'
        ELSE 'Atualização de vínculo da etapa'
      END,
      jsonb_build_object(
        'sequence_order', NEW.sequence_order,
        'session_number', NEW.session_number,
        'old_appointment_id', OLD.appointment_id,
        'new_appointment_id', NEW.appointment_id,
        'old_service_id', OLD.service_id,
        'new_service_id', NEW.service_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_package_appointment_history_trigger ON public.package_appointments;
CREATE TRIGGER log_package_appointment_history_trigger
AFTER INSERT OR UPDATE ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.log_package_appointment_history();