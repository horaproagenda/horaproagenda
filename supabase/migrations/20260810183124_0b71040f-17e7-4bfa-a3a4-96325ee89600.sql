-- Tenant isolation for user_permissions (derived from profiles.account_owner_id)
CREATE POLICY "user_permissions_tenant_isolation_restrictive"
ON public.user_permissions
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_account_owner_for_user(user_id) = public.current_account_owner_id()
)
WITH CHECK (
  public.get_account_owner_for_user(user_id) = public.current_account_owner_id()
);