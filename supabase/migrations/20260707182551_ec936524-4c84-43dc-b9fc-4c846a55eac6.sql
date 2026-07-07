
-- 1) whatsapp_pricing_config: restrict SELECT to admins/super_admins
DROP POLICY IF EXISTS "Authenticated can read pricing config" ON public.whatsapp_pricing_config;
CREATE POLICY "Admins can read pricing config"
  ON public.whatsapp_pricing_config
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- 2) terms_acceptances: remove permissive anon insert; require authenticated user tying record to self
DROP POLICY IF EXISTS "Anon can insert acceptance during signup" ON public.terms_acceptances;
CREATE POLICY "Users insert own acceptance"
  ON public.terms_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3) package_appointment_history: rescope restrictive tenant policy to authenticated
DROP POLICY IF EXISTS "tenant_isolation_restrictive" ON public.package_appointment_history;
CREATE POLICY "tenant_isolation_restrictive"
  ON public.package_appointment_history
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()) OR (account_owner_id = current_account_owner_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR (account_owner_id = current_account_owner_id()));
