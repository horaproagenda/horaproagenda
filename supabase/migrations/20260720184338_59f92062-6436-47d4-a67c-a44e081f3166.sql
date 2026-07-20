
DO $$
DECLARE
  r record;
  has_col boolean;
BEGIN
  FOR r IN
    SELECT c.relname AS tname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname = 'tenant_isolation_restrictive'
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=r.tname AND column_name='account_owner_id'
    ) INTO has_col;
    IF NOT has_col THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.%I', r.tname);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_restrictive ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (account_owner_id = current_account_owner_id()) WITH CHECK (account_owner_id IS NULL OR account_owner_id = current_account_owner_id())',
      r.tname
    );
  END LOOP;
END $$;

-- appointments
DROP POLICY IF EXISTS tenant_select_appointments ON public.appointments;
DROP POLICY IF EXISTS tenant_update_appointments ON public.appointments;
DROP POLICY IF EXISTS tenant_delete_appointments ON public.appointments;
DROP POLICY IF EXISTS tenant_insert_appointments ON public.appointments;

CREATE POLICY tenant_select_appointments ON public.appointments FOR SELECT TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR (has_role(auth.uid(), 'professional'::app_role) AND professional_id = get_professional_id_for_user(auth.uid()))
  )
);

CREATE POLICY tenant_insert_appointments ON public.appointments FOR INSERT TO authenticated
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR (has_role(auth.uid(), 'professional'::app_role)
        AND professional_id = get_professional_id_for_user(auth.uid())
        AND can_access_client_record(client_id))
  )
);

CREATE POLICY tenant_update_appointments ON public.appointments FOR UPDATE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR (has_role(auth.uid(), 'professional'::app_role) AND professional_id = get_professional_id_for_user(auth.uid()))
  )
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR (has_role(auth.uid(), 'professional'::app_role) AND professional_id = get_professional_id_for_user(auth.uid()))
  )
);

CREATE POLICY tenant_delete_appointments ON public.appointments FOR DELETE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- business_settings
DROP POLICY IF EXISTS tenant_select_business_settings ON public.business_settings;
DROP POLICY IF EXISTS tenant_update_business_settings ON public.business_settings;

CREATE POLICY tenant_select_business_settings ON public.business_settings FOR SELECT TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR has_role(auth.uid(), 'professional'::app_role)
  )
);

CREATE POLICY tenant_update_business_settings ON public.business_settings FOR UPDATE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Guardrail: block super_admin from reading tenant data client-side.
CREATE OR REPLACE FUNCTION public.assert_not_super_admin_reading_tenant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.is_super_admin(auth.uid())
$$;

DO $$
DECLARE
  t text;
  sensitive text[] := ARRAY[
    'appointments','clients','client_documents','client_credit_transactions',
    'financial_entries','cash_transactions','messages','whatsapp_messages',
    'treatment_photos','service_packages','package_appointments','single_sales',
    'boleto_installments','payments_audit','professional_credentials',
    'appointment_additional_items','appointment_product_consumption',
    'client_services','product_daily_consumption','reminders'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS block_super_admin_tenant_read ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY block_super_admin_tenant_read ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.assert_not_super_admin_reading_tenant()) WITH CHECK (public.assert_not_super_admin_reading_tenant())',
        t
      );
    END IF;
  END LOOP;
END $$;
