
-- 1) daily_summary_log: autofill default + trigger
ALTER TABLE public.daily_summary_log
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

DROP TRIGGER IF EXISTS autofill_account_owner_id ON public.daily_summary_log;
CREATE TRIGGER autofill_account_owner_id
  BEFORE INSERT ON public.daily_summary_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

-- 2) trial_registrations: enforce user_id NOT NULL + RESTRICTIVE ownership policy
ALTER TABLE public.trial_registrations
  ALTER COLUMN user_id SET NOT NULL;

DROP POLICY IF EXISTS ownership_restrictive ON public.trial_registrations;
CREATE POLICY ownership_restrictive ON public.trial_registrations
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- 3) IP log tables: explicit service_role write/read policy
DROP POLICY IF EXISTS "Service role manages email ip log" ON public.email_verification_ip_log;
CREATE POLICY "Service role manages email ip log"
  ON public.email_verification_ip_log
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages phone ip log" ON public.phone_verification_ip_log;
CREATE POLICY "Service role manages phone ip log"
  ON public.phone_verification_ip_log
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);
