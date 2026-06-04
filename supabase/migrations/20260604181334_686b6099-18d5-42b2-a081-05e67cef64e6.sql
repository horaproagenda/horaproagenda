CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  document text NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;
GRANT INSERT ON public.terms_acceptances TO anon;
GRANT ALL ON public.terms_acceptances TO service_role;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own acceptances"
ON public.terms_acceptances FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can insert own acceptance"
ON public.terms_acceptances FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Anon can insert acceptance during signup"
ON public.terms_acceptances FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user ON public.terms_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptances_email ON public.terms_acceptances(email);