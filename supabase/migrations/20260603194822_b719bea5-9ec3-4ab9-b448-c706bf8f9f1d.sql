
CREATE TABLE IF NOT EXISTS public.professional_whatsapp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL UNIQUE REFERENCES public.professionals(id) ON DELETE CASCADE,
  api_url text,
  instance_id text NOT NULL,
  token text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_whatsapp_credentials TO authenticated;
GRANT ALL ON public.professional_whatsapp_credentials TO service_role;

ALTER TABLE public.professional_whatsapp_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to whatsapp credentials"
  ON public.professional_whatsapp_credentials
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Professional manages own whatsapp credentials"
  ON public.professional_whatsapp_credentials
  FOR ALL
  TO authenticated
  USING (professional_id = public.get_professional_id_for_user(auth.uid()))
  WITH CHECK (professional_id = public.get_professional_id_for_user(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_prof_wa_creds_active
  ON public.professional_whatsapp_credentials (professional_id) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.touch_prof_wa_creds_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_prof_wa_creds_touch ON public.professional_whatsapp_credentials;
CREATE TRIGGER trg_prof_wa_creds_touch BEFORE UPDATE ON public.professional_whatsapp_credentials
FOR EACH ROW EXECUTE FUNCTION public.touch_prof_wa_creds_updated_at();
