
-- 1. account_subscriptions: add restrictive tenant isolation + explicit CRUD policies
CREATE POLICY "restrictive_tenant_account_subscriptions"
ON public.account_subscriptions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (owner_user_id = auth.uid() OR is_super_admin(auth.uid()))
WITH CHECK (owner_user_id = auth.uid() OR is_super_admin(auth.uid()));

CREATE POLICY "Super admin can manage subscriptions"
ON public.account_subscriptions
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Owner can insert own subscription"
ON public.account_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owner can update own subscription"
ON public.account_subscriptions
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owner can delete own subscription"
ON public.account_subscriptions
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

-- 2. whatsapp_pricing_config: restrictive super_admin only defense in depth
CREATE POLICY "restrictive_super_admin_pricing_config"
ON public.whatsapp_pricing_config
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 3. user_roles: add restrictive defense-in-depth against self-role grant / escalation
CREATE POLICY "restrictive_no_self_role_escalation"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (user_id <> auth.uid() AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role]))
);

CREATE POLICY "restrictive_no_self_role_update"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (user_id <> auth.uid() AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role]))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (user_id <> auth.uid() AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role]))
);
