CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.processed_stripe_events TO service_role;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages processed_stripe_events"
  ON public.processed_stripe_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);