DROP POLICY IF EXISTS "Authenticated users can view boleto audit logs" ON public.boleto_audit_log;

CREATE POLICY "Admins and receptionists can view boleto audit logs"
ON public.boleto_audit_log
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'receptionist'::app_role)
);