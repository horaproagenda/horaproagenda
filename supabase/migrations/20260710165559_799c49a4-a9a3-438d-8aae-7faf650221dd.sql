-- Fix: audit_trigger_function was inserting into audit_logs without account_owner_id,
-- which triggered the autofill trigger and raised in service-role contexts
-- (no auth.uid()), causing create-appointment to fail with "account_owner_id não
-- pôde ser determinado". Now we propagate the source row's account_owner_id.
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_owner UUID;
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    BEGIN v_owner := (row_to_json(NEW)->>'account_owner_id')::uuid; EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
    IF v_owner IS NULL THEN v_owner := public.get_account_owner_for_user(v_user_id); END IF;
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id, user_email, account_owner_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_user_id, v_user_email, v_owner);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    BEGIN v_owner := (row_to_json(NEW)->>'account_owner_id')::uuid; EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
    IF v_owner IS NULL THEN v_owner := public.get_account_owner_for_user(v_user_id); END IF;
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id, user_email, account_owner_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_user_id, v_user_email, v_owner);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    BEGIN v_owner := (row_to_json(OLD)->>'account_owner_id')::uuid; EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
    IF v_owner IS NULL THEN v_owner := public.get_account_owner_for_user(v_user_id); END IF;
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id, user_email, account_owner_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_user_id, v_user_email, v_owner);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;