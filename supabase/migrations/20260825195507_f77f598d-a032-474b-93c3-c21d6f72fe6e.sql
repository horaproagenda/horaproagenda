-- 1) account_subscriptions: campos do ciclo de cobrança, teste e carência
ALTER TABLE public.account_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_percentage numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS trial_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;

-- 2) Cobranças da assinatura (uma linha por cobrança no gateway)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.account_subscriptions(id) ON DELETE CASCADE,
  gateway_payment_id text UNIQUE,
  billing_cycle text,
  plan_users integer,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  final_amount numeric(10,2),
  status text NOT NULL DEFAULT 'pending',
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner lê as cobranças da própria conta"
  ON public.payments FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP TRIGGER IF EXISTS update_payments_updated_at ON public.payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Eventos de webhook do gateway (auditoria + idempotência)
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL DEFAULT 'asaas',
  gateway_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_event_id)
);
GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Somente super admin lê eventos de webhook"
  ON public.payment_webhook_events FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 4) Notificações internas da conta
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  user_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário lê as próprias notificações"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR owner_user_id = auth.uid());
CREATE POLICY "Usuário marca as próprias notificações como lidas"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR owner_user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR owner_user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 5) Cartões tokenizados no gateway — apenas metadados, nunca número/CVV
CREATE TABLE IF NOT EXISTS public.account_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.account_subscriptions(id) ON DELETE SET NULL,
  gateway text NOT NULL DEFAULT 'asaas',
  brand text,
  last_four_digits text,
  expiration_month text,
  expiration_year text,
  holder_name text,
  is_default boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_payment_methods TO authenticated;
GRANT ALL ON public.account_payment_methods TO service_role;
ALTER TABLE public.account_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner lê os cartões da própria conta"
  ON public.account_payment_methods FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP TRIGGER IF EXISTS update_account_payment_methods_updated_at ON public.account_payment_methods;
CREATE TRIGGER update_account_payment_methods_updated_at BEFORE UPDATE ON public.account_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Novo cadastro nasce PENDENTE DE PLANO: o teste de 20 dias só começa
--    depois que o administrador escolhe o plano e cadastra o cartão.
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.account_subscriptions (owner_user_id, status, trial_ends_at, seat_limit)
  VALUES (NEW.id, 'pending', NULL, 1)
  ON CONFLICT (owner_user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_account_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.account_owner_id IS NULL OR NEW.account_owner_id = NEW.id THEN
    INSERT INTO public.account_subscriptions (
      owner_user_id, status, trial_ends_at, seat_limit
    ) VALUES (
      NEW.id, 'pending', NULL, 1
    )
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 7) Suspensão automática: carência de 2 dias encerrada sem pagamento
CREATE OR REPLACE FUNCTION public.suspend_overdue_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE affected integer;
BEGIN
  UPDATE public.account_subscriptions
  SET status = 'suspended', suspended_at = now(), updated_at = now()
  WHERE status IN ('past_due', 'overdue', 'failed')
    AND grace_ends_at IS NOT NULL
    AND grace_ends_at < now();
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;