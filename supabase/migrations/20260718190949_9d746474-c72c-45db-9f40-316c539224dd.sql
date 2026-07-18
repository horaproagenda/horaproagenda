
-- 1) audit_log: add RESTRICTIVE tenant isolation policy
CREATE POLICY "tenant_isolation_restrictive"
ON public.audit_log
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()) OR account_owner_id IS NULL OR account_owner_id = current_account_owner_id())
WITH CHECK (is_super_admin(auth.uid()) OR account_owner_id IS NULL OR account_owner_id = current_account_owner_id());

-- 2) daily_summary_log: recreate restrictive policy scoped to authenticated
DROP POLICY IF EXISTS "tenant_isolation_restrictive" ON public.daily_summary_log;
CREATE POLICY "tenant_isolation_restrictive"
ON public.daily_summary_log
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()) OR account_owner_id = current_account_owner_id())
WITH CHECK (is_super_admin(auth.uid()) OR account_owner_id = current_account_owner_id());

-- 3) has_role: scope to current tenant to prevent cross-tenant role reuse
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        -- super_admin is global; other roles must match current tenant
        ur.role = 'super_admin'::app_role
        OR ur.account_owner_id IS NULL
        OR ur.account_owner_id = public.current_account_owner_id()
      )
  );
$function$;
