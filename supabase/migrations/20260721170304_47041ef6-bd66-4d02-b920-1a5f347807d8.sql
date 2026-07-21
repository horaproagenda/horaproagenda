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
    EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  END IF;

  IF v_owner IS NULL THEN
    BEGIN
      v_owner := public.get_account_owner_for_user((row_to_json(NEW)->>'created_by')::uuid);
    EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  END IF;

  -- Try both professional_id and assigned_professional_id (clients uses the latter)
  IF v_owner IS NULL THEN
    BEGIN
      SELECT p.account_owner_id INTO v_owner
      FROM public.professionals p
      WHERE p.id = (row_to_json(NEW)->>'professional_id')::uuid
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  END IF;

  IF v_owner IS NULL THEN
    BEGIN
      SELECT p.account_owner_id INTO v_owner
      FROM public.professionals p
      WHERE p.id = (row_to_json(NEW)->>'assigned_professional_id')::uuid
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_owner := NULL; END;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_owner_id não pôde ser determinado para o registro (sem contexto de autenticação). Rejeitando inserção para evitar vazamento entre contas.'
      USING ERRCODE = '42501';
  END IF;

  NEW.account_owner_id := v_owner;
  RETURN NEW;
END;
$function$;