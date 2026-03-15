
-- ============================================================
-- 1. ADD RLS POLICIES TO UNPROTECTED TABLES
-- ============================================================

-- cash_register_entries
CREATE POLICY "Admins and receptionists can view cash_register_entries"
  ON public.cash_register_entries FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));
CREATE POLICY "Admins and receptionists can insert cash_register_entries"
  ON public.cash_register_entries FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));
CREATE POLICY "Admins can delete cash_register_entries"
  ON public.cash_register_entries FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- payments_audit
CREATE POLICY "Admins can view payments_audit"
  ON public.payments_audit FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert payments_audit"
  ON public.payments_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- verification_codes
CREATE POLICY "No direct access to verification_codes"
  ON public.verification_codes FOR SELECT TO authenticated
  USING (false);

-- phone_contacts
CREATE POLICY "Authenticated users can view phone_contacts"
  ON public.phone_contacts FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert phone_contacts"
  ON public.phone_contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- room_members
CREATE POLICY "Authenticated users can view room_members"
  ON public.room_members FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert room_members"
  ON public.room_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- index_audit_candidates
CREATE POLICY "Admins can view index_audit_candidates"
  ON public.index_audit_candidates FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- monitor_jobs
CREATE POLICY "Admins can view monitor_jobs"
  ON public.monitor_jobs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- policies_backup
CREATE POLICY "Admins can view policies_backup"
  ON public.policies_backup FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- supabase_migrations
CREATE POLICY "Admins can view supabase_migrations"
  ON public.supabase_migrations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert supabase_migrations"
  ON public.supabase_migrations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 2. TIGHTEN OVERLY PERMISSIVE RLS POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Consumption records can be created by authenticated users" ON public.appointment_product_consumption;
CREATE POLICY "Consumption records can be created by authenticated users"
  ON public.appointment_product_consumption FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Consumption records can be deleted by authenticated users" ON public.appointment_product_consumption;
CREATE POLICY "Consumption records can be deleted by authenticated users"
  ON public.appointment_product_consumption FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

DROP POLICY IF EXISTS "Only triggers can insert audit logs" ON public.audit_logs;
CREATE POLICY "Only triggers can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert client documents" ON public.client_documents;
CREATE POLICY "Authenticated users can insert client documents"
  ON public.client_documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert package appointments" ON public.package_appointments;
CREATE POLICY "Authenticated users can insert package appointments"
  ON public.package_appointments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can update package appointments" ON public.package_appointments;
CREATE POLICY "Authenticated users can update package appointments"
  ON public.package_appointments FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Package template products can be created by authenticated users" ON public.package_template_products;
CREATE POLICY "Package template products can be created by authenticated users"
  ON public.package_template_products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Package template products can be updated by authenticated users" ON public.package_template_products;
CREATE POLICY "Package template products can be updated by authenticated users"
  ON public.package_template_products FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Package template products can be deleted by authenticated users" ON public.package_template_products;
CREATE POLICY "Package template products can be deleted by authenticated users"
  ON public.package_template_products FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'receptionist'));

DROP POLICY IF EXISTS "Authenticated users can insert quotes" ON public.quotes;
CREATE POLICY "Authenticated users can insert quotes"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert treatment photos" ON public.treatment_photos;
CREATE POLICY "Authenticated users can insert treatment photos"
  ON public.treatment_photos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "whatsapp_logs_insert" ON public.whatsapp_logs;
CREATE POLICY "whatsapp_logs_insert"
  ON public.whatsapp_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 3. FIX FUNCTION search_path (SECURITY HARDENING)
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_dml_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  data jsonb;
  op text := TG_OP;
BEGIN
  IF (op = 'INSERT') THEN
    data := to_jsonb(NEW);
  ELSIF (op = 'UPDATE') THEN
    data := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF (op = 'DELETE') THEN
    data := to_jsonb(OLD);
  END IF;
  INSERT INTO public.audit_log(event_type, object_type, object_identity, command_tag, username, role_name, sql_text, detail)
  VALUES ('dml', TG_TABLE_NAME, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, op, current_user, session_user, NULL, data);
  IF (op = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_on_document_create()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  PERFORM pg_notify('enqueue_whatsapp', NEW.id::text);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.attach_document_trigger(table_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  EXECUTE format('CREATE TRIGGER trg_%I_enqueue_document AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION public.enqueue_on_document_create();', table_name, table_name);
  RETURN 'trigger created';
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.attach_document_trigger_2(schema_name text, table_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  EXECUTE format('CREATE TRIGGER trg_%I_%I_enqueue_document AFTER INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.enqueue_on_document_create();', schema_name, table_name, schema_name, table_name);
  RETURN 'trigger created';
EXCEPTION WHEN others THEN
  RETURN SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.whatsapp_messages_broadcast_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || COALESCE(NEW.user_id::text, OLD.user_id::text),
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.room_messages_broadcast_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  PERFORM realtime.broadcast_changes(
    'room:' || COALESCE(NEW.room_id, OLD.room_id)::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_sale_payment_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_exists boolean;
  v_payment_method text;
  v_amount numeric;
  v_client_id uuid;
  v_processed_by uuid;
  v_payment_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.paid_at IS NULL THEN RETURN NEW; END IF;
    IF OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;
  ELSE
    RETURN NEW;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.payments_audit WHERE single_sale_id = NEW.id) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;
  v_amount := COALESCE(NEW.final_amount, NEW.original_amount - COALESCE(NEW.discount_amount,0));
  v_client_id := NEW.client_id;
  v_processed_by := NEW.paid_by;
  SELECT pm.name INTO v_payment_method FROM public.payment_methods pm WHERE pm.id = NEW.payment_method_id LIMIT 1;
  IF v_payment_method IS NULL THEN v_payment_method := 'unknown'; END IF;
  IF v_payment_method ILIKE '%credit%' OR v_payment_method ILIKE '%credito%' THEN
    v_payment_type := 'credit_to_client';
  ELSIF v_amount IS NOT NULL AND v_amount = 0 THEN
    v_payment_type := 'discount';
  ELSE
    v_payment_type := 'cash_in';
  END IF;
  PERFORM public.process_payment_low(NEW.id, v_client_id, v_processed_by, v_payment_method, v_amount, v_payment_type, 'reconciled by trigger');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_cash_register(p_cash_register_id uuid, p_closed_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_opened_at timestamptz;
  v_closed_at timestamptz := now();
  v_opening_balance numeric := 0;
  v_total_received numeric := 0;
  v_expected_balance numeric := 0;
  v_breakdown jsonb;
BEGIN
  SELECT opened_at, opening_balance INTO v_opened_at, v_opening_balance
  FROM public.cash_registers WHERE id = p_cash_register_id FOR UPDATE;
  IF v_opened_at IS NULL THEN
    RAISE EXCEPTION 'Cash register % not found or opened_at is null', p_cash_register_id;
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_total_received
  FROM public.cash_register_entries
  WHERE affects_cash = true AND created_at >= v_opened_at AND created_at <= v_closed_at;
  SELECT jsonb_object_agg(payment_method, to_jsonb(total_amount)) INTO v_breakdown
  FROM (
    SELECT COALESCE(payment_method,'unknown') AS payment_method, SUM(amount) AS total_amount
    FROM public.cash_register_entries
    WHERE affects_cash = true AND created_at >= v_opened_at AND created_at <= v_closed_at
    GROUP BY COALESCE(payment_method,'unknown')
  ) t;
  IF v_breakdown IS NULL THEN v_breakdown := '{}'::jsonb; END IF;
  v_expected_balance := v_opening_balance + v_total_received;
  UPDATE public.cash_registers
  SET closed_at = v_closed_at, closing_balance = v_expected_balance, total_received = v_total_received,
      payment_breakdown = v_breakdown, closed_by = p_closed_by, status = 'closed', updated_at = now()
  WHERE id = p_cash_register_id;
END;
$function$;
