ALTER TABLE public.account_subscriptions
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'asaas';

CREATE INDEX IF NOT EXISTS idx_account_subscriptions_asaas_customer
  ON public.account_subscriptions (asaas_customer_id);
CREATE INDEX IF NOT EXISTS idx_account_subscriptions_asaas_subscription
  ON public.account_subscriptions (asaas_subscription_id);

CREATE TABLE IF NOT EXISTS public.processed_asaas_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.processed_asaas_events TO service_role;
ALTER TABLE public.processed_asaas_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asaas events service only" ON public.processed_asaas_events;
CREATE POLICY "asaas events service only"
  ON public.processed_asaas_events
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);