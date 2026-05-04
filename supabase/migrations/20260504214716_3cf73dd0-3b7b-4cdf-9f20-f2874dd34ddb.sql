
-- Revert overly restrictive policy
DROP POLICY IF EXISTS "Admins and receptionists can view settings" ON public.business_settings;
CREATE POLICY "Authenticated users can view settings"
  ON public.business_settings FOR SELECT TO authenticated
  USING (true);

-- Column-level: hide CNPJ and Twilio number from non-privileged users
REVOKE SELECT (clinic_cnpj, twilio_from_number) ON public.business_settings FROM authenticated;
REVOKE SELECT (clinic_cnpj, twilio_from_number) ON public.business_settings FROM anon;

-- Privileged accessor for admins/receptionists
CREATE OR REPLACE FUNCTION public.get_sensitive_business_settings()
RETURNS TABLE (clinic_cnpj text, twilio_from_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'receptionist'::public.app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
    SELECT bs.clinic_cnpj, bs.twilio_from_number
    FROM public.business_settings bs
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sensitive_business_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sensitive_business_settings() TO authenticated;
