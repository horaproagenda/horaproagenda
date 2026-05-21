
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'card_brands' AND p.polcmd = 'r'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.card_brands TO authenticated', r.polname);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.email_verification_ip_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_ip_log_ip_created
  ON public.email_verification_ip_log (ip, created_at DESC);

ALTER TABLE public.email_verification_ip_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to email ip log"
  ON public.email_verification_ip_log
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
