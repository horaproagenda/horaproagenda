
-- 1. Reminder log: restrict SELECT to admin + receptionist
DROP POLICY IF EXISTS "Authenticated read reminder log" ON public.appointment_reminder_log;
CREATE POLICY "Staff read reminder log"
  ON public.appointment_reminder_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

-- 2. Trial registrations: block self-escalation of privileged fields via trigger
CREATE OR REPLACE FUNCTION public.prevent_trial_privileged_field_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to change anything
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin users cannot change privileged fields
  IF NEW.has_paid IS DISTINCT FROM OLD.has_paid
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.trial_days IS DISTINCT FROM OLD.trial_days
     OR NEW.trial_ended_at IS DISTINCT FROM OLD.trial_ended_at
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Não é permitido alterar campos de assinatura/avaliação';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_trial_privileged_field_update ON public.trial_registrations;
CREATE TRIGGER trg_prevent_trial_privileged_field_update
  BEFORE UPDATE ON public.trial_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_trial_privileged_field_update();
