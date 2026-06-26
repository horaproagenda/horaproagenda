
-- 1) Prevent privilege escalation: only super_admins can create/modify super_admin roles.
DROP POLICY IF EXISTS tenant_insert_user_roles ON public.user_roles;
CREATE POLICY tenant_insert_user_roles ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      account_owner_id = current_account_owner_id()
      AND has_role(auth.uid(), 'admin'::app_role)
      AND role <> 'super_admin'::app_role
    )
  );

DROP POLICY IF EXISTS tenant_update_user_roles ON public.user_roles;
CREATE POLICY tenant_update_user_roles ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      account_owner_id = current_account_owner_id()
      AND has_role(auth.uid(), 'admin'::app_role)
      AND role <> 'super_admin'::app_role
    )
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      account_owner_id = current_account_owner_id()
      AND has_role(auth.uid(), 'admin'::app_role)
      AND role <> 'super_admin'::app_role
    )
  );

DROP POLICY IF EXISTS tenant_delete_user_roles ON public.user_roles;
CREATE POLICY tenant_delete_user_roles ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      account_owner_id = current_account_owner_id()
      AND has_role(auth.uid(), 'admin'::app_role)
      AND role <> 'super_admin'::app_role
    )
  );

-- 2) Clear temp_password automatically once the professional changes their password
--    or after a short TTL (24h), so admins cannot read usable plaintext credentials.
CREATE OR REPLACE FUNCTION public.clear_temp_password_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.password_changed_at IS NOT NULL
     AND (OLD.password_changed_at IS DISTINCT FROM NEW.password_changed_at) THEN
    NEW.temp_password := NULL;
    NEW.must_change_password := FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_temp_password ON public.professional_credentials;
CREATE TRIGGER trg_clear_temp_password
  BEFORE UPDATE ON public.professional_credentials
  FOR EACH ROW EXECUTE FUNCTION public.clear_temp_password_on_change();

-- Backfill: any credential where password was already changed must not retain the temp password.
UPDATE public.professional_credentials
SET temp_password = NULL
WHERE password_changed_at IS NOT NULL AND temp_password IS NOT NULL;

-- Also expire temp passwords older than 24h that were never used.
UPDATE public.professional_credentials
SET temp_password = NULL
WHERE temp_password IS NOT NULL
  AND set_at IS NOT NULL
  AND set_at < now() - INTERVAL '24 hours';

-- Recurring cleanup function (can be called by cron or app logic) to expire old temp passwords.
CREATE OR REPLACE FUNCTION public.expire_old_temp_passwords()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.professional_credentials
  SET temp_password = NULL
  WHERE temp_password IS NOT NULL
    AND set_at IS NOT NULL
    AND set_at < now() - INTERVAL '24 hours';
$$;
