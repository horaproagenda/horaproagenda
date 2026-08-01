-- 1) Restrict admin management policy on appointment_reminder_log to authenticated
DROP POLICY IF EXISTS "Admins manage reminder log" ON public.appointment_reminder_log;
CREATE POLICY "Admins manage reminder log"
ON public.appointment_reminder_log
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2) Remove NULL account_owner_id bypass in has_role (column is NOT NULL, no null rows)
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
        ur.role = 'super_admin'::app_role
        OR ur.account_owner_id = public.current_account_owner_id()
      )
  );
$function$;

-- 3) Scope internal diagnostic table policies to authenticated
DROP POLICY IF EXISTS "Super admins can view monitor_jobs" ON public.monitor_jobs;
CREATE POLICY "Super admins can view monitor_jobs"
ON public.monitor_jobs FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can view index_audit_candidates" ON public.index_audit_candidates;
CREATE POLICY "Super admins can view index_audit_candidates"
ON public.index_audit_candidates FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can view policies_backup" ON public.policies_backup;
CREATE POLICY "Super admins can view policies_backup"
ON public.policies_backup FOR SELECT TO authenticated
USING (is_super_admin(auth.uid()));

-- 4) Re-assert that temp_password stays inaccessible to client roles
REVOKE SELECT (temp_password) ON public.professional_credentials FROM anon, authenticated;