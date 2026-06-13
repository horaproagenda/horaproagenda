
-- 1. Restrict SELECT on product_daily_consumption to admins/receptionists or the row creator.
DROP POLICY IF EXISTS "Authenticated users can view product consumption" ON public.product_daily_consumption;

CREATE POLICY "Scoped read product consumption"
ON public.product_daily_consumption
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR created_by = auth.uid()
  OR professional_id IN (SELECT id FROM public.professionals WHERE user_id = auth.uid())
);

-- 2. Revoke column-level read on professional_credentials.temp_password so even admins
--    cannot read plaintext temp passwords via the API. Triggers/service_role still can.
REVOKE SELECT (temp_password) ON public.professional_credentials FROM authenticated;
REVOKE SELECT (temp_password) ON public.professional_credentials FROM anon;
