
-- Fix remaining functions without search_path

CREATE OR REPLACE FUNCTION public.get_document_fill_link_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  rec public.document_fill_links%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO rec FROM public.document_fill_links WHERE token = p_token AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT to_jsonb(rec) - 'token' INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_ddl_event()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
DECLARE
  rec RECORD;
  obj json;
BEGIN
  FOR rec IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    obj := json_build_object('object_type', rec.object_type, 'schema', rec.schema_name, 'object_identity', rec.object_identity, 'command', rec.command_tag);
    INSERT INTO public.audit_log(event_type, object_type, object_identity, command_tag, username, role_name, sql_text, detail)
    VALUES ('ddl', rec.object_type, COALESCE(rec.object_identity, rec.object_type), rec.command_tag, current_user, session_user, rec.command_tag, obj);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_migration(p_version text, p_name text, p_status text, p_applied_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.supabase_migrations WHERE version = p_version) THEN
    INSERT INTO public.supabase_migrations(version, name, status, applied_by) VALUES (p_version, p_name, p_status, p_applied_by);
  ELSE
    UPDATE public.supabase_migrations SET name = p_name, status = p_status, created_at = now(), applied_by = p_applied_by WHERE version = p_version;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- process_payment_low overload 1 (7 params)
CREATE OR REPLACE FUNCTION public.process_payment_low(p_single_sale_id uuid, p_client_id uuid, p_processed_by uuid, p_payment_method text, p_amount numeric, p_payment_type text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.payments_audit(single_sale_id, client_id, processed_by, payment_method, amount, payment_type, note)
  VALUES (p_single_sale_id, p_client_id, p_processed_by, p_payment_method, p_amount, p_payment_type, p_note);
  IF LOWER(p_payment_method) LIKE '%crédito ao cliente%' OR LOWER(p_payment_method) LIKE '%credito ao cliente%' THEN
    INSERT INTO public.cash_register_entries(single_sale_id, client_id, amount, payment_method, affects_cash, created_by)
    VALUES (p_single_sale_id, p_client_id, p_amount, p_payment_method, false, p_processed_by);
  ELSIF LOWER(p_payment_method) LIKE '%pix%' OR LOWER(p_payment_method) LIKE '%dinheiro%' OR LOWER(p_payment_method) LIKE '%cash%' OR LOWER(p_payment_method) LIKE '%débito%' OR LOWER(p_payment_method) LIKE '%debito%' OR LOWER(p_payment_method) LIKE '%cartão%' OR LOWER(p_payment_method) LIKE '%transferência%' OR LOWER(p_payment_method) LIKE '%transferencia%' THEN
    INSERT INTO public.cash_register_entries(single_sale_id, client_id, amount, payment_method, affects_cash, created_by)
    VALUES (p_single_sale_id, p_client_id, p_amount, p_payment_method, true, p_processed_by);
  ELSE
    INSERT INTO public.cash_register_entries(single_sale_id, client_id, amount, payment_method, affects_cash, created_by)
    VALUES (p_single_sale_id, p_client_id, p_amount, p_payment_method, false, p_processed_by);
  END IF;
  IF p_payment_type = 'credit_to_client' THEN
    INSERT INTO public.financial_entries(id, created_at, amount, type, description, client_id)
    VALUES (gen_random_uuid(), now(), p_amount, 'credit', COALESCE(p_note,'Credit to client'), p_client_id);
  ELSIF p_payment_type = 'discount' THEN
    UPDATE public.single_sales
      SET discount_amount = COALESCE(discount_amount,0) + p_amount,
          final_amount = GREATEST(COALESCE(original_amount,0) - COALESCE(discount_amount,0) - p_amount,0),
          paid_at = CASE WHEN GREATEST(COALESCE(original_amount,0) - COALESCE(discount_amount,0) - p_amount,0) = 0 THEN now() ELSE paid_at END,
          paid_by = CASE WHEN GREATEST(COALESCE(original_amount,0) - COALESCE(discount_amount,0) - p_amount,0) = 0 THEN p_processed_by ELSE paid_by END
    WHERE id = p_single_sale_id;
  END IF;
  IF p_payment_type <> 'discount' THEN
    UPDATE public.single_sales SET paid_at = now(), paid_by = p_processed_by WHERE id = p_single_sale_id;
  END IF;
END;
$function$;

-- process_payment_low overload 2 (8 params)
CREATE OR REPLACE FUNCTION public.process_payment_low(p_single_sale_id uuid, p_client_id uuid, p_processed_by uuid, p_payment_method text, p_amount numeric, p_payment_type text, p_note text DEFAULT NULL::text, p_change_amount numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_affects_cash boolean := false;
  v_change_method text;
BEGIN
  INSERT INTO public.payments_audit(single_sale_id, client_id, processed_by, payment_method, amount, payment_type, note)
  VALUES (p_single_sale_id, p_client_id, p_processed_by, p_payment_method, p_amount, p_payment_type, p_note);
  IF p_payment_method IS NOT NULL THEN
    CASE lower(trim(p_payment_method))
      WHEN 'pix' THEN v_affects_cash := true;
      WHEN 'dinheiro' THEN v_affects_cash := true;
      WHEN 'cheque' THEN v_affects_cash := true;
      WHEN 'transferência bancária' THEN v_affects_cash := true;
      WHEN 'transferencia bancaria' THEN v_affects_cash := true;
      WHEN 'transferência' THEN v_affects_cash := true;
      WHEN 'transferencia' THEN v_affects_cash := true;
      WHEN 'boleto bancário' THEN v_affects_cash := true;
      WHEN 'boleto' THEN v_affects_cash := true;
      WHEN 'cartão de crédito' THEN v_affects_cash := true;
      WHEN 'cartao de credito' THEN v_affects_cash := true;
      WHEN 'cartão de débito' THEN v_affects_cash := true;
      WHEN 'cartao de debito' THEN v_affects_cash := true;
      WHEN 'crédito ao cliente' THEN v_affects_cash := false;
      WHEN 'credito ao cliente' THEN v_affects_cash := false;
      ELSE v_affects_cash := false;
    END CASE;
  END IF;
  INSERT INTO public.cash_register_entries(single_sale_id, client_id, amount, payment_method, affects_cash, created_by)
  VALUES (p_single_sale_id, p_client_id, p_amount, p_payment_method, v_affects_cash, p_processed_by);
  IF p_change_amount IS NOT NULL AND p_change_amount <> 0 THEN
    v_change_method := 'Troco - ' || COALESCE(p_payment_method,'');
    INSERT INTO public.cash_register_entries(single_sale_id, client_id, amount, payment_method, affects_cash, created_by)
    VALUES (p_single_sale_id, p_client_id, -ABS(p_change_amount), v_change_method, true, p_processed_by);
  END IF;
  IF p_payment_type = 'credit_to_client' THEN
    INSERT INTO public.financial_entries(id, created_at, updated_at, amount, type, description, client_id, status, due_date)
    VALUES (gen_random_uuid(), now(), now(), p_amount, 'credit', COALESCE(p_note,'Credit to client'), p_client_id, 'pending', now());
  ELSIF p_payment_type = 'discount' THEN
    UPDATE public.single_sales
      SET discount_amount = COALESCE(discount_amount,0) + p_amount,
          final_amount = GREATEST(COALESCE(original_amount,0) - COALESCE(discount_amount,0) - p_amount,0),
          paid_at = CASE WHEN GREATEST(COALESCE(original_amount,0) - COALESCE(discount_amount,0) - p_amount,0) = 0 THEN now() ELSE paid_at END,
          paid_by = CASE WHEN GREATEST(COALESCE(original_amount,0) - COALESCE(discount_amount,0) - p_amount,0) = 0 THEN p_processed_by ELSE paid_by END
    WHERE id = p_single_sale_id;
  END IF;
  IF p_payment_type <> 'discount' THEN
    UPDATE public.single_sales SET paid_at = now(), paid_by = p_processed_by WHERE id = p_single_sale_id;
  END IF;
END;
$function$;
