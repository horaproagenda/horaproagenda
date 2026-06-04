
-- 1) RPC: uso de assentos (usados, limite, disponíveis) — para UI
CREATE OR REPLACE FUNCTION public.get_seat_usage(_owner uuid DEFAULT NULL)
RETURNS TABLE(used integer, seat_limit integer, available integer, is_grandfathered boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_used int;
  v_limit int;
  v_grand boolean;
BEGIN
  v_owner := COALESCE(_owner, public.get_account_owner(auth.uid()));
  IF v_owner IS NULL THEN RETURN; END IF;

  SELECT s.seat_limit, COALESCE(s.is_grandfathered, false)
    INTO v_limit, v_grand
  FROM public.account_subscriptions s
  WHERE s.owner_user_id = v_owner;

  v_used := public.count_account_seats(v_owner);
  RETURN QUERY SELECT v_used,
                      COALESCE(v_limit, 0),
                      GREATEST(COALESCE(v_limit, 0) - v_used, 0),
                      COALESCE(v_grand, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seat_usage(uuid) TO authenticated;

-- 2) Trigger no profiles: bloqueia ativar/vincular usuário acima do seat_limit
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
  -- só aplica para colaboradores vinculados (account_owner_id) e ativos
  v_owner := NEW.account_owner_id;
  IF v_owner IS NULL OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- pular se nada relevante mudou em UPDATE
  IF TG_OP = 'UPDATE'
     AND OLD.account_owner_id IS NOT DISTINCT FROM NEW.account_owner_id
     AND OLD.is_active IS NOT DISTINCT FROM NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- o próprio dono não consome além do limite (já é contado em count_account_seats)
  SELECT s.seat_limit, COALESCE(s.is_grandfathered, false), s.status
    INTO v_limit, v_grand, v_status
  FROM public.account_subscriptions s
  WHERE s.owner_user_id = v_owner;

  IF v_grand OR v_status = 'grandfathered' THEN
    RETURN NEW;
  END IF;

  -- contar quantos já estariam ativos APÓS esta operação (excluindo a própria linha em UPDATE)
  SELECT COUNT(*)::int INTO v_used
  FROM public.profiles p
  WHERE p.is_active = true
    AND (p.id = v_owner OR p.account_owner_id = v_owner)
    AND p.id <> NEW.id;

  -- somar a linha NEW
  v_used := v_used + 1;

  IF COALESCE(v_limit, 0) > 0 AND v_used > v_limit THEN
    RAISE EXCEPTION 'Limite de % usuário(s) atingido para esta conta. Faça upgrade do plano para adicionar mais.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_account_seat_limit ON public.profiles;
CREATE TRIGGER trg_enforce_account_seat_limit
BEFORE INSERT OR UPDATE OF account_owner_id, is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_account_seat_limit();

-- 3) Trigger: quando seat_limit diminui em account_subscriptions (downgrade via Stripe),
--    log estruturado em audit_log para visibilidade do admin.
CREATE OR REPLACE FUNCTION public.log_seat_limit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.seat_limit IS DISTINCT FROM NEW.seat_limit THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (
      NEW.owner_user_id,
      CASE WHEN NEW.seat_limit > COALESCE(OLD.seat_limit,0) THEN 'seat_upgrade' ELSE 'seat_downgrade' END,
      'account_subscriptions',
      NEW.id,
      jsonb_build_object('seat_limit', OLD.seat_limit),
      jsonb_build_object('seat_limit', NEW.seat_limit, 'stripe_price_id', NEW.stripe_price_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_seat_limit_change ON public.account_subscriptions;
CREATE TRIGGER trg_log_seat_limit_change
AFTER UPDATE OF seat_limit ON public.account_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.log_seat_limit_change();
