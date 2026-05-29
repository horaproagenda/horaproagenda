CREATE TABLE public.verificacoes_whatsapp (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telefone text NOT NULL,
  codigo_verificacao text NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  verificado boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_verificacoes_whatsapp_telefone ON public.verificacoes_whatsapp(telefone);
CREATE INDEX idx_verificacoes_whatsapp_criado_em ON public.verificacoes_whatsapp(criado_em DESC);

-- Public registration flow: anon needs to insert/select/update for its own phone verification
GRANT SELECT, INSERT, UPDATE ON public.verificacoes_whatsapp TO anon;
GRANT SELECT, INSERT, UPDATE ON public.verificacoes_whatsapp TO authenticated;
GRANT ALL ON public.verificacoes_whatsapp TO service_role;

ALTER TABLE public.verificacoes_whatsapp ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anon) can create a verification request
CREATE POLICY "Anyone can request whatsapp verification"
  ON public.verificacoes_whatsapp
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone can read recent (last 15 minutes) records to validate their own code client-side
CREATE POLICY "Anyone can read recent verifications"
  ON public.verificacoes_whatsapp
  FOR SELECT
  TO anon, authenticated
  USING (criado_em > now() - interval '15 minutes');

-- Anyone can mark recent record as verified
CREATE POLICY "Anyone can confirm recent verifications"
  ON public.verificacoes_whatsapp
  FOR UPDATE
  TO anon, authenticated
  USING (criado_em > now() - interval '15 minutes')
  WITH CHECK (criado_em > now() - interval '15 minutes');