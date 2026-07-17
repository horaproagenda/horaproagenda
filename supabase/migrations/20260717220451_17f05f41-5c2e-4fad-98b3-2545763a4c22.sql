CREATE OR REPLACE FUNCTION public.enforce_account_seat_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_limit int;
  v_used int;
  v_grand boolean;
  v_status text;
BEGIN
  v_owner := NEW.account_owner_id;
  IF v_owner IS NULL OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.account_owner_id IS NOT DISTINCT FROM NEW.account_owner_id
     AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Serializa inserts/updates concorrentes para o mesmo owner (evita ultrapassar limite sob carga).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text, 42));

  SELECT s.seat_limit, COALESCE(s.is_grandfathered, false), s.status
    INTO v_limit, v_grand, v_status
  FROM public.account_subscriptions s
  WHERE s.owner_user_id = v_owner
  FOR UPDATE;

  IF v_grand OR v_status = 'grandfathered' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int INTO v_used
  FROM public.profiles p
  WHERE p.is_active = true
    AND (p.id = v_owner OR p.account_owner_id = v_owner)
    AND p.id <> NEW.id;

  v_used := v_used + 1;

  IF COALESCE(v_limit, 0) > 0 AND v_used > v_limit THEN
    RAISE EXCEPTION 'Limite de % usuário(s) atingido para esta conta. Faça upgrade do plano para adicionar mais.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;