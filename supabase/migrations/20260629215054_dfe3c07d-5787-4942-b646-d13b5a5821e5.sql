
-- 1. Endereço estruturado em business_settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS clinic_cep text,
  ADD COLUMN IF NOT EXISTS clinic_street text,
  ADD COLUMN IF NOT EXISTS clinic_number text,
  ADD COLUMN IF NOT EXISTS clinic_complement text,
  ADD COLUMN IF NOT EXISTS clinic_neighborhood text,
  ADD COLUMN IF NOT EXISTS clinic_city text,
  ADD COLUMN IF NOT EXISTS clinic_state text,
  ADD COLUMN IF NOT EXISTS professional_name text;

-- 2. Endereço opcional por profissional
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;

-- 3. Tabela de verificação de troca de contato
CREATE TABLE IF NOT EXISTS public.contact_change_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('email','phone')),
  new_value text NOT NULL,
  code text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_change_verifications TO authenticated;
GRANT ALL ON public.contact_change_verifications TO service_role;

ALTER TABLE public.contact_change_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contact change verifications"
  ON public.contact_change_verifications
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contact_change_verif_user ON public.contact_change_verifications(user_id, created_at DESC);

-- 4. Trigger para manter clinic_address (string concatenada) em sincronia
CREATE OR REPLACE FUNCTION public.tg_sync_clinic_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[] := ARRAY[]::text[];
  line1 text;
  line2 text;
BEGIN
  IF NEW.clinic_street IS NOT NULL AND length(trim(NEW.clinic_street)) > 0 THEN
    line1 := trim(NEW.clinic_street);
    IF NEW.clinic_number IS NOT NULL AND length(trim(NEW.clinic_number)) > 0 THEN
      line1 := line1 || ', ' || trim(NEW.clinic_number);
    END IF;
    IF NEW.clinic_complement IS NOT NULL AND length(trim(NEW.clinic_complement)) > 0 THEN
      line1 := line1 || ' - ' || trim(NEW.clinic_complement);
    END IF;
    parts := parts || line1;
  END IF;

  IF NEW.clinic_neighborhood IS NOT NULL AND length(trim(NEW.clinic_neighborhood)) > 0 THEN
    parts := parts || trim(NEW.clinic_neighborhood);
  END IF;

  line2 := NULL;
  IF NEW.clinic_city IS NOT NULL AND length(trim(NEW.clinic_city)) > 0 THEN
    line2 := trim(NEW.clinic_city);
    IF NEW.clinic_state IS NOT NULL AND length(trim(NEW.clinic_state)) > 0 THEN
      line2 := line2 || '/' || trim(NEW.clinic_state);
    END IF;
  ELSIF NEW.clinic_state IS NOT NULL AND length(trim(NEW.clinic_state)) > 0 THEN
    line2 := trim(NEW.clinic_state);
  END IF;
  IF line2 IS NOT NULL THEN parts := parts || line2; END IF;

  IF NEW.clinic_cep IS NOT NULL AND length(trim(NEW.clinic_cep)) > 0 THEN
    parts := parts || ('CEP ' || trim(NEW.clinic_cep));
  END IF;

  IF array_length(parts, 1) IS NOT NULL THEN
    NEW.clinic_address := array_to_string(parts, ' - ');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_clinic_address ON public.business_settings;
CREATE TRIGGER trg_sync_clinic_address
  BEFORE INSERT OR UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_clinic_address();
