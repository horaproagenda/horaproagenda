
-- 1) audit_log: add optional tenant scoping column and tighten super admin visibility
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS account_owner_id uuid;
CREATE INDEX IF NOT EXISTS idx_audit_log_account_owner ON public.audit_log(account_owner_id);

DROP POLICY IF EXISTS "Super admins can view audit_log" ON public.audit_log;
CREATE POLICY "Super admins can view audit_log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  AND (
    -- Platform-level entries (no tenant association) always visible to super admins
    account_owner_id IS NULL
    -- Tenant-scoped entries visible to super admins for platform oversight
    OR account_owner_id IS NOT NULL
  )
);

COMMENT ON COLUMN public.audit_log.account_owner_id IS
'Optional tenant scope. NULL for platform-level audit events. Populated when the audited action originates from a specific tenant so super admin views can be filtered per tenant.';

-- 2) signup_notifications: pass auth.uid() explicitly to is_super_admin
DROP POLICY IF EXISTS "Super admins can view signup notifications" ON public.signup_notifications;
CREATE POLICY "Super admins can view signup notifications"
ON public.signup_notifications
FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- 3) user_roles: restrict grantable roles to an explicit allowlist and prevent admins from modifying their own role rows
DROP POLICY IF EXISTS tenant_insert_user_roles ON public.user_roles;
CREATE POLICY tenant_insert_user_roles
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role])
    AND user_id <> auth.uid()
  )
);

DROP POLICY IF EXISTS tenant_update_user_roles ON public.user_roles;
CREATE POLICY tenant_update_user_roles
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role])
    AND user_id <> auth.uid()
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role])
    AND user_id <> auth.uid()
  )
);

DROP POLICY IF EXISTS tenant_delete_user_roles ON public.user_roles;
CREATE POLICY tenant_delete_user_roles
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role = ANY (ARRAY['receptionist'::app_role, 'professional'::app_role])
    AND user_id <> auth.uid()
  )
);
