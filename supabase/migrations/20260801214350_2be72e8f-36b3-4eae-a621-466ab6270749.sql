-- 1) professional_credentials: remove super admin cross-tenant access from permissive policies
DROP POLICY IF EXISTS "tenant_read_professional_credentials" ON public.professional_credentials;
CREATE POLICY "tenant_read_professional_credentials"
ON public.professional_credentials FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() AND has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "tenant_write_professional_credentials" ON public.professional_credentials;
CREATE POLICY "tenant_write_professional_credentials"
ON public.professional_credentials FOR ALL TO authenticated
USING (account_owner_id = current_account_owner_id() AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (account_owner_id = current_account_owner_id() AND has_role(auth.uid(), 'admin'::app_role));

-- 2) Apply consistent super admin cross-tenant block on tenant-scoped tables
DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.professionals;
CREATE POLICY block_super_admin_tenant_read ON public.professionals AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant() OR user_id = auth.uid())
WITH CHECK (assert_not_super_admin_reading_tenant() OR user_id = auth.uid());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.profiles;
CREATE POLICY block_super_admin_tenant_read ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant() OR id = auth.uid())
WITH CHECK (assert_not_super_admin_reading_tenant() OR id = auth.uid());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.account_subscriptions;
CREATE POLICY block_super_admin_tenant_read ON public.account_subscriptions AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant() OR owner_user_id = auth.uid())
WITH CHECK (assert_not_super_admin_reading_tenant() OR owner_user_id = auth.uid());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.business_settings;
CREATE POLICY block_super_admin_tenant_read ON public.business_settings AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.services;
CREATE POLICY block_super_admin_tenant_read ON public.services AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.rooms;
CREATE POLICY block_super_admin_tenant_read ON public.rooms AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.products;
CREATE POLICY block_super_admin_tenant_read ON public.products AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.payment_methods;
CREATE POLICY block_super_admin_tenant_read ON public.payment_methods AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.financial_categories;
CREATE POLICY block_super_admin_tenant_read ON public.financial_categories AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.equipment;
CREATE POLICY block_super_admin_tenant_read ON public.equipment AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.service_products;
CREATE POLICY block_super_admin_tenant_read ON public.service_products AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.professional_whatsapp_credentials;
CREATE POLICY block_super_admin_tenant_read ON public.professional_whatsapp_credentials AS RESTRICTIVE FOR ALL TO authenticated
USING (assert_not_super_admin_reading_tenant()) WITH CHECK (assert_not_super_admin_reading_tenant());

-- 3) whatsapp_logs: require tenant ownership on insert, remove NULL bypass
DROP POLICY IF EXISTS whatsapp_logs_insert ON public.whatsapp_logs;
CREATE POLICY whatsapp_logs_insert ON public.whatsapp_logs FOR INSERT TO authenticated
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role) OR has_role(auth.uid(), 'professional'::app_role))
);

DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.whatsapp_logs;
CREATE POLICY tenant_isolation_restrictive ON public.whatsapp_logs AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = current_account_owner_id())
WITH CHECK (account_owner_id = current_account_owner_id());