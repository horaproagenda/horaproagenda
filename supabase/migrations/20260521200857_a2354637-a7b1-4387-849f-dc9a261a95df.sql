
-- Restrict anon access on business configuration tables
DO $$
DECLARE
  r record;
  tbls text[] := ARRAY['card_brand_fees','payment_methods','financial_categories','service_products','rooms','equipment'];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR r IN
      SELECT polname FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd = 'r'
    LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', r.polname, t);
    END LOOP;
  END LOOP;
END $$;

-- IP-based rate limit table for phone verification SMS
CREATE TABLE IF NOT EXISTS public.phone_verification_ip_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_verification_ip_log_ip_created
  ON public.phone_verification_ip_log (ip, created_at DESC);

ALTER TABLE public.phone_verification_ip_log ENABLE ROW LEVEL SECURITY;

-- No client access; only service role (edge function) reads/writes
CREATE POLICY "No client access to ip log"
  ON public.phone_verification_ip_log
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
