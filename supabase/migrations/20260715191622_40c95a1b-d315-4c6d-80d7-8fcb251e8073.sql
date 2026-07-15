-- Fix: ao vincular sessões realizadas via edge function (service role, auth.uid()=null),
-- o trigger de audit `log_package_appointment_history` inseria em package_appointment_history
-- sem account_owner_id, disparando o autofill trigger que exige contexto de auth.
-- Passamos o account_owner_id explicitamente, derivado do pacote / sessão.

CREATE OR REPLACE FUNCTION public.log_package_appointment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT account_owner_id INTO v_owner FROM public.service_packages WHERE id = NEW.package_id;
    v_owner := COALESCE(NEW.account_owner_id, v_owner, public.get_account_owner_for_user(auth.uid()));

    INSERT INTO public.package_appointment_history (
      package_appointment_id, package_id, appointment_id,
      new_scheduled_date, new_status, changed_by, change_reason, metadata,
      account_owner_id
    ) VALUES (
      NEW.id, NEW.package_id, NEW.appointment_id,
      NEW.scheduled_date, NEW.status, auth.uid(), 'Etapa criada',
      jsonb_build_object('sequence_order', NEW.sequence_order, 'session_number', NEW.session_number),
      v_owner
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.appointment_id IS DISTINCT FROM NEW.appointment_id
    OR OLD.service_id IS DISTINCT FROM NEW.service_id
  ) THEN
    SELECT account_owner_id INTO v_owner FROM public.service_packages WHERE id = NEW.package_id;
    v_owner := COALESCE(NEW.account_owner_id, v_owner, public.get_account_owner_for_user(auth.uid()));

    INSERT INTO public.package_appointment_history (
      package_appointment_id, package_id, appointment_id,
      previous_scheduled_date, new_scheduled_date,
      previous_status, new_status, changed_by, change_reason, metadata,
      account_owner_id
    ) VALUES (
      NEW.id, NEW.package_id, NEW.appointment_id,
      OLD.scheduled_date, NEW.scheduled_date,
      OLD.status, NEW.status, auth.uid(),
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
      ),
      v_owner
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Também endurece o trigger de autofill em package_appointment_history para,
-- na ausência de auth.uid(), buscar o dono via package_id (evita falha em qualquer
-- outro caminho que insira nessa tabela sem passar o owner explicitamente).
CREATE OR REPLACE FUNCTION public.tg_autofill_owner_package_appointment_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.account_owner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_owner := public.get_account_owner_for_user(auth.uid());

  IF v_owner IS NULL AND NEW.package_id IS NOT NULL THEN
    SELECT account_owner_id INTO v_owner FROM public.service_packages WHERE id = NEW.package_id;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_owner_id não pôde ser determinado para package_appointment_history.'
      USING ERRCODE = '42501';
  END IF;

  NEW.account_owner_id := v_owner;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS autofill_account_owner_id ON public.package_appointment_history;
CREATE TRIGGER autofill_account_owner_id
  BEFORE INSERT ON public.package_appointment_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_owner_package_appointment_history();