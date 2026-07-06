
CREATE POLICY tenant_isolation_restrictive ON public.daily_summary_log
  AS RESTRICTIVE FOR ALL TO public
  USING (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id())
  WITH CHECK (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id());

ALTER TABLE public.professional_preferences
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

DROP TRIGGER IF EXISTS autofill_account_owner_id ON public.professional_preferences;
CREATE TRIGGER autofill_account_owner_id
  BEFORE INSERT ON public.professional_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

DROP POLICY IF EXISTS "System can insert payments_audit" ON public.payments_audit;
CREATE POLICY "Admins and receptionists can insert payments_audit"
  ON public.payments_audit FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  );

DROP POLICY IF EXISTS "Anyone can submit interest lead" ON public.interest_leads;
CREATE POLICY "Anyone can submit interest lead"
  ON public.interest_leads FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(name) BETWEEN 1 AND 200
    AND char_length(email) BETWEEN 3 AND 320
    AND (whatsapp IS NULL OR char_length(whatsapp) <= 40)
    AND (business_area IS NULL OR char_length(business_area) <= 100)
    AND (message IS NULL OR char_length(message) <= 2000)
    AND contacted_by IS NULL
    AND contacted_at IS NULL
  );
