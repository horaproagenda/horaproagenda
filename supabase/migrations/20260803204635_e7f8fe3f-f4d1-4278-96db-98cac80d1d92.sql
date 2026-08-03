-- 1) whatsapp_pricing_config: platform-global table (no tenant column).
-- Tenant admins get read-only; only super_admin may write.
DROP POLICY IF EXISTS "Admins manage pricing config" ON public.whatsapp_pricing_config;
DROP POLICY IF EXISTS "Admins can read pricing config" ON public.whatsapp_pricing_config;
DROP POLICY IF EXISTS restrictive_super_admin_pricing_config ON public.whatsapp_pricing_config;

CREATE POLICY "pricing_config_read_staff"
  ON public.whatsapp_pricing_config
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pricing_config_super_admin_write"
  ON public.whatsapp_pricing_config
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Restrictive gate: nothing but super_admin can mutate; reads limited to staff.
CREATE POLICY "pricing_config_restrictive_gate"
  ON public.whatsapp_pricing_config
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_pricing_config FROM authenticated;
REVOKE ALL ON public.whatsapp_pricing_config FROM anon;
GRANT SELECT ON public.whatsapp_pricing_config TO authenticated;
GRANT ALL ON public.whatsapp_pricing_config TO service_role;

-- Same treatment for the volume tiers table (platform-global pricing).
DROP POLICY IF EXISTS "Admins can delete pricing tiers" ON public.whatsapp_volume_pricing_tiers;
DROP POLICY IF EXISTS "Admins can insert pricing tiers" ON public.whatsapp_volume_pricing_tiers;
DROP POLICY IF EXISTS "Admins can update pricing tiers" ON public.whatsapp_volume_pricing_tiers;
DROP POLICY IF EXISTS "Admins can read pricing tiers" ON public.whatsapp_volume_pricing_tiers;

CREATE POLICY "pricing_tiers_read_staff"
  ON public.whatsapp_volume_pricing_tiers
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "pricing_tiers_super_admin_write"
  ON public.whatsapp_volume_pricing_tiers
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_volume_pricing_tiers FROM authenticated;
REVOKE ALL ON public.whatsapp_volume_pricing_tiers FROM anon;
GRANT SELECT ON public.whatsapp_volume_pricing_tiers TO authenticated;
GRANT ALL ON public.whatsapp_volume_pricing_tiers TO service_role;

-- 2) deleted_account_blocklist: platform anti-abuse table, super_admin only,
-- explicit restrictive gate so no future permissive policy can widen access.
CREATE POLICY "blocklist_restrictive_super_admin_only"
  ON public.deleted_account_blocklist
  AS RESTRICTIVE
  FOR ALL TO authenticated, anon
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.deleted_account_blocklist FROM authenticated;
REVOKE ALL ON public.deleted_account_blocklist FROM anon;
GRANT SELECT ON public.deleted_account_blocklist TO authenticated;
GRANT ALL ON public.deleted_account_blocklist TO service_role;