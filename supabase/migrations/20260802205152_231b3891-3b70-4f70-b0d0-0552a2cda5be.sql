CREATE OR REPLACE FUNCTION public.guard_account_subscription_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- service_role (webhook Stripe / edge functions) e chamadas sem usuário
  -- autenticado (jobs internos) podem escrever tudo.
  is_privileged := (auth.role() IS DISTINCT FROM 'authenticated');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Usuário só pode criar a própria linha em estado não pago.
    NEW.status := 'inactive';
    NEW.plan_tier := NULL;
    NEW.seat_limit := 1;
    NEW.trial_ends_at := NULL;
    NEW.current_period_end := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: preserva todos os campos de cobrança.
  NEW.status := OLD.status;
  NEW.plan_tier := OLD.plan_tier;
  NEW.seat_limit := OLD.seat_limit;
  NEW.trial_ends_at := OLD.trial_ends_at;
  NEW.current_period_end := OLD.current_period_end;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.owner_user_id := OLD.owner_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_account_subscription_billing ON public.account_subscriptions;
CREATE TRIGGER guard_account_subscription_billing
BEFORE INSERT OR UPDATE ON public.account_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.guard_account_subscription_billing_columns();