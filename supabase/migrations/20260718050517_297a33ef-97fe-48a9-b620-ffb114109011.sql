
-- 1. user_roles: block admin/super_admin grants except by super_admin
CREATE POLICY "restrictive_block_admin_role_grant"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR role NOT IN ('admin'::app_role, 'super_admin'::app_role)
);

CREATE POLICY "restrictive_block_admin_role_update"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR role NOT IN ('admin'::app_role, 'super_admin'::app_role)
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR role NOT IN ('admin'::app_role, 'super_admin'::app_role)
);

-- Defense-in-depth: ensure user_roles rows always belong to the caller's tenant
CREATE POLICY "restrictive_user_roles_tenant_scope"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR account_owner_id = current_account_owner_id()
  OR user_id = auth.uid()
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR account_owner_id = current_account_owner_id()
);

-- 2. terms_acceptances: remove NULL user_id insert path
DROP POLICY IF EXISTS "Authenticated can insert own acceptance" ON public.terms_acceptances;

CREATE POLICY "Authenticated can insert own acceptance"
ON public.terms_acceptances
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 3. app_version_events: require user_id = auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert version events" ON public.app_version_events;

CREATE POLICY "Authenticated users can insert version events"
ON public.app_version_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
