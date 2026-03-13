-- Fix global write failures caused by audit trigger inserts being blocked by RLS on public.audit_log

-- Ensure RLS remains enabled
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Create INSERT policy so trigger function log_dml_changes can write audit entries during normal app mutations
DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON public.audit_log;
CREATE POLICY "Authenticated users can insert audit_log"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Optional admin read policy for diagnostics
DROP POLICY IF EXISTS "Admins can view audit_log" ON public.audit_log;
CREATE POLICY "Admins can view audit_log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));