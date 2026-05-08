
ALTER TABLE public.trial_registrations
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS trial_registrations_cpf_unique
  ON public.trial_registrations (cpf) WHERE cpf IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

ALTER TABLE public.phone_verification_codes ENABLE ROW LEVEL SECURITY;

-- Block all direct client access; only the service role (edge functions) reads/writes.
DROP POLICY IF EXISTS "Block all direct access" ON public.phone_verification_codes;
CREATE POLICY "Block all direct access"
ON public.phone_verification_codes
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS phone_verification_codes_phone_idx
  ON public.phone_verification_codes(phone, created_at DESC);
