
-- 1) business_settings: restrict twilio_from_number to admin-only via SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.get_sensitive_business_settings()
RETURNS TABLE(clinic_cnpj text, twilio_from_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    -- Receptionists can still see CNPJ for invoicing/contact, but never twilio sender
    IF public.has_role(auth.uid(), 'receptionist'::public.app_role) THEN
      RETURN QUERY SELECT bs.clinic_cnpj, NULL::text FROM public.business_settings bs LIMIT 1;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY SELECT bs.clinic_cnpj, bs.twilio_from_number FROM public.business_settings bs LIMIT 1;
END;
$$;

-- 2) appointment_edit_locks: scope SELECT/INSERT to users with appointment access
DROP POLICY IF EXISTS "Users can view locks for accessible appointments" ON public.appointment_edit_locks;
CREATE POLICY "Users can view locks for accessible appointments"
ON public.appointment_edit_locks
FOR SELECT TO authenticated
USING (public.can_access_appointment(appointment_id));

DROP POLICY IF EXISTS "Users can create own appointment locks" ON public.appointment_edit_locks;
CREATE POLICY "Users can create own appointment locks"
ON public.appointment_edit_locks
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_access_appointment(appointment_id));

-- 3) boleto_installments: scope by client access via parent sale
DROP POLICY IF EXISTS "Staff can view boleto installments" ON public.boleto_installments;
CREATE POLICY "Staff can view boleto installments"
ON public.boleto_installments
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.single_sales s
    WHERE s.id = boleto_installments.sale_id
      AND public.can_access_client_record(s.client_id)
  )
);

DROP POLICY IF EXISTS "Staff can update boleto installments" ON public.boleto_installments;
CREATE POLICY "Staff can update boleto installments"
ON public.boleto_installments
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.single_sales s
    WHERE s.id = boleto_installments.sale_id
      AND public.can_access_client_record(s.client_id)
  )
);

DROP POLICY IF EXISTS "Staff can delete boleto installments" ON public.boleto_installments;
CREATE POLICY "Staff can delete boleto installments"
ON public.boleto_installments
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.single_sales s
    WHERE s.id = boleto_installments.sale_id
      AND public.can_access_client_record(s.client_id)
  )
);

DROP POLICY IF EXISTS "Staff can create boleto installments" ON public.boleto_installments;
CREATE POLICY "Staff can create boleto installments"
ON public.boleto_installments
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.single_sales s
    WHERE s.id = boleto_installments.sale_id
      AND public.can_access_client_record(s.client_id)
  )
);

-- 4) professional_credentials: revoke direct column access to temp_password.
-- Force reads through a SECURITY DEFINER function that re-checks admin role.
REVOKE SELECT (temp_password) ON public.professional_credentials FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_professional_temp_password(_user_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pwd text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT temp_password INTO v_pwd
  FROM public.professional_credentials
  WHERE user_id = _user_id
    AND must_change_password = true
    AND set_at > now() - interval '7 days'
  LIMIT 1;
  -- Audit access
  PERFORM public.log_access('professional_credentials', 'view', 'professional_credential', _user_id,
    ARRAY['temp_password'], '{}'::text[], '{}'::jsonb);
  RETURN v_pwd;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_professional_temp_password(uuid) TO authenticated;
