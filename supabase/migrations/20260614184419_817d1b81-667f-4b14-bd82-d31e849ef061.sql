
-- Update autofill trigger: add ultimate fallback to first admin (covers
-- migration-time inserts where auth.uid() is NULL and the row has no user_id).
CREATE OR REPLACE FUNCTION public.tg_autofill_account_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.account_owner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_owner := public.get_account_owner_for_user(auth.uid());

  IF v_owner IS NULL THEN
    BEGIN
      v_owner := public.get_account_owner_for_user((row_to_json(NEW)->>'user_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_owner := NULL;
    END;
  END IF;

  IF v_owner IS NULL THEN
    BEGIN
      v_owner := public.get_account_owner_for_user((row_to_json(NEW)->>'created_by')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_owner := NULL;
    END;
  END IF;

  IF v_owner IS NULL THEN
    -- last-resort: first admin (covers migration/system inserts)
    SELECT ur.user_id INTO v_owner
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
    ORDER BY ur.user_id LIMIT 1;
  END IF;

  NEW.account_owner_id := v_owner;
  RETURN NEW;
END;
$$;

REVOKE SELECT (temp_password) ON public.professional_credentials FROM authenticated;
REVOKE SELECT (temp_password) ON public.professional_credentials FROM anon;

DO $$
DECLARE
  v_default_owner uuid;
  v_table         text;
  v_tables        text[] := ARRAY[
    'clients','financial_entries','single_sales',
    'cash_registers','cash_transactions','cash_register_entries',
    'audit_logs','access_logs',
    'products','product_purchases','suppliers',
    'banks','card_brands','card_brand_fees','payment_methods',
    'reminders','goals','financial_categories',
    'boleto_installments','boleto_audit_log',
    'services','package_templates','whatsapp_templates',
    'equipment','rooms',
    'professional_absences','professional_service_commissions',
    'client_documents','client_credit_transactions','client_services','treatment_photos',
    'service_packages','service_products','package_appointments',
    'package_template_products','package_template_steps',
    'waitlist','quotes',
    'whatsapp_queue','whatsapp_messages','whatsapp_logs','whatsapp_send_queue',
    'appointment_additional_items','appointment_edit_locks',
    'appointment_product_consumption','appointment_reminder_log',
    'document_templates','document_fill_links','client_registration_links',
    'dismissed_notifications','product_daily_consumption'
  ];
BEGIN
  SELECT ur.user_id INTO v_default_owner
  FROM public.user_roles ur WHERE ur.role='admin' ORDER BY ur.user_id LIMIT 1;

  -- PASS 1: column + trigger + index
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS account_owner_id uuid', v_table);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_autofill_owner_%I ON public.%I', v_table, v_table);
    EXECUTE format($q$
      CREATE TRIGGER trg_autofill_owner_%I
        BEFORE INSERT ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id()
    $q$, v_table, v_table);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_owner ON public.%I(account_owner_id)', v_table, v_table);
  END LOOP;

  -- PASS 2: relationship-based backfill (uuid sources only)
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=v_table
                 AND column_name='created_by' AND data_type='uuid') THEN
      EXECUTE format($q$
        UPDATE public.%I t SET account_owner_id = public.get_account_owner_for_user(t.created_by)
        WHERE t.account_owner_id IS NULL AND t.created_by IS NOT NULL
      $q$, v_table);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=v_table
                 AND column_name='user_id' AND data_type='uuid') THEN
      EXECUTE format($q$
        UPDATE public.%I t SET account_owner_id = public.get_account_owner_for_user(t.user_id)
        WHERE t.account_owner_id IS NULL AND t.user_id IS NOT NULL
      $q$, v_table);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=v_table
                 AND column_name='professional_id' AND data_type='uuid') THEN
      EXECUTE format($q$
        UPDATE public.%I t SET account_owner_id = p.account_owner_id
        FROM public.professionals p
        WHERE t.professional_id = p.id AND t.account_owner_id IS NULL
      $q$, v_table);
    END IF;
  END LOOP;

  -- PASS 3: default-owner fallback (twice over, to catch rows inserted by
  -- audit triggers during the previous loop)
  FOR i IN 1..2 LOOP
    FOREACH v_table IN ARRAY v_tables LOOP
      EXECUTE format('UPDATE public.%I SET account_owner_id=%L WHERE account_owner_id IS NULL',
                     v_table, v_default_owner);
    END LOOP;
  END LOOP;

  -- PASS 4: NOT NULL
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN account_owner_id SET NOT NULL', v_table);
  END LOOP;

  -- PASS 5: restrictive RLS policy
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.%I', v_table);
    EXECUTE format($q$
      CREATE POLICY tenant_isolation_restrictive
        ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
        USING (
          public.is_super_admin(auth.uid())
          OR account_owner_id = public.current_account_owner_id()
        )
        WITH CHECK (
          public.is_super_admin(auth.uid())
          OR account_owner_id = public.current_account_owner_id()
        )
    $q$, v_table);
  END LOOP;
END $$;
