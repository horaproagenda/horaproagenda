
-- 1. Restrict internal maintenance tables to super_admin only
DROP POLICY IF EXISTS "Admins can view audit_log" ON public.audit_log;
CREATE POLICY "Super admins can view audit_log" ON public.audit_log
  FOR SELECT USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view index_audit_candidates" ON public.index_audit_candidates;
CREATE POLICY "Super admins can view index_audit_candidates" ON public.index_audit_candidates
  FOR SELECT USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view monitor_jobs" ON public.monitor_jobs;
CREATE POLICY "Super admins can view monitor_jobs" ON public.monitor_jobs
  FOR SELECT USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view policies_backup" ON public.policies_backup;
CREATE POLICY "Super admins can view policies_backup" ON public.policies_backup
  FOR SELECT USING (public.is_super_admin(auth.uid()));

-- 2. user_roles: also block escalation of existing rows (UPDATE USING must exclude admin/super_admin targets)
DROP POLICY IF EXISTS tenant_update_user_roles ON public.user_roles;
CREATE POLICY tenant_update_user_roles ON public.user_roles
  FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role])
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role])
    )
  );

DROP POLICY IF EXISTS tenant_delete_user_roles ON public.user_roles;
CREATE POLICY tenant_delete_user_roles ON public.user_roles
  FOR DELETE
  USING (
    public.is_super_admin(auth.uid())
    OR (
      account_owner_id = public.current_account_owner_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
      AND role <> ALL (ARRAY['super_admin'::app_role, 'admin'::app_role])
    )
  );

-- 3. professional_credentials: remove plaintext temp_password storage entirely
UPDATE public.professional_credentials SET temp_password = NULL WHERE temp_password IS NOT NULL;
REVOKE SELECT (temp_password), INSERT (temp_password), UPDATE (temp_password) ON public.professional_credentials FROM authenticated, anon;
COMMENT ON COLUMN public.professional_credentials.temp_password IS 'DEPRECATED — plaintext storage disallowed. Column retained for schema stability; always NULL. Deliver temp passwords via one-time secure channel.';
