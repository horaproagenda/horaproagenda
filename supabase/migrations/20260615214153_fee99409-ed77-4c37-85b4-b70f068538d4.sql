
-- Fix 1: Tighten ultramsg_instance_pool restrictive policy to authenticated role
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.ultramsg_instance_pool;
CREATE POLICY tenant_isolation_restrictive
ON public.ultramsg_instance_pool
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Fix 2: Add tenant isolation to professional_preferences
-- Helper to resolve a user's account_owner_id via professionals table
CREATE OR REPLACE FUNCTION public.get_user_account_owner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_owner_id FROM public.professionals WHERE user_id = _user_id LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_account_owner_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_account_owner_id(uuid) TO authenticated, service_role;

-- Restrictive policy: every access to professional_preferences must be within the caller's tenant
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.professional_preferences;
CREATE POLICY tenant_isolation_restrictive
ON public.professional_preferences
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.get_user_account_owner_id(user_id) = public.current_account_owner_id()
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.get_user_account_owner_id(user_id) = public.current_account_owner_id()
);
