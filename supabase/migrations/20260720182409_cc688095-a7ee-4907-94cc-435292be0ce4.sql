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
    BEGIN
      SELECT p.account_owner_id INTO v_owner
      FROM public.professionals p
      WHERE p.id = (row_to_json(NEW)->>'professional_id')::uuid
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_owner := NULL;
    END;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_owner_id não pôde ser determinado para o registro (sem contexto de autenticação). Rejeitando inserção para evitar vazamento entre contas.'
      USING ERRCODE = '42501';
  END IF;

  NEW.account_owner_id := v_owner;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_auto_approve_whatsapp_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true
     AND NEW.instance_id IS NOT NULL
     AND (NEW.token IS NOT NULL OR NEW.token_encrypted IS NOT NULL) THEN
    UPDATE public.professionals
       SET whatsapp_release_approved = true,
           whatsapp_release_approved_at = COALESCE(whatsapp_release_approved_at, now()),
           updated_at = now()
     WHERE id = NEW.professional_id
       AND COALESCE(whatsapp_release_approved, false) = false;
  END IF;
  RETURN NEW;
END;
$function$;

UPDATE public.professionals
   SET whatsapp_release_approved = true,
       whatsapp_release_approved_at = COALESCE(whatsapp_release_approved_at, now()),
       updated_at = now()
 WHERE lower(email) = lower('lumeagenda54@gmail.com')
   AND COALESCE(whatsapp_release_approved, false) = false;