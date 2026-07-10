-- Hardening: remove the "last-resort first admin" fallback in the
-- account_owner_id autofill trigger. This fallback was silently attributing
-- new rows to an unrelated admin whenever auth.uid() was NULL and no user_id
-- / created_by column could be derived from the NEW row, causing cross-tenant
-- data leaks (e.g. records created by one owner ending up under another
-- owner's account). The correct behavior is to REFUSE the insert instead of
-- guessing a tenant.
CREATE OR REPLACE FUNCTION public.tg_autofill_account_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- SECURITY: never fall back to "first admin". That silently routes
    -- new rows into an unrelated tenant's account.
    RAISE EXCEPTION 'account_owner_id não pôde ser determinado para o registro (sem contexto de autenticação). Rejeitando inserção para evitar vazamento entre contas.'
      USING ERRCODE = '42501';
  END IF;

  NEW.account_owner_id := v_owner;
  RETURN NEW;
END;
$function$;