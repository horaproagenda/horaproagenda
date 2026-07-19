
-- 1. Column-level revoke on professional_credentials.temp_password
REVOKE SELECT (temp_password) ON public.professional_credentials FROM authenticated, anon, PUBLIC;

-- 2. Fix restrictive policy scope on professional_whatsapp_credentials (public -> authenticated)
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.professional_whatsapp_credentials;
CREATE POLICY tenant_isolation_restrictive
  ON public.professional_whatsapp_credentials
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()) OR (account_owner_id = current_account_owner_id()))
  WITH CHECK (is_super_admin(auth.uid()) OR (account_owner_id = current_account_owner_id()));
