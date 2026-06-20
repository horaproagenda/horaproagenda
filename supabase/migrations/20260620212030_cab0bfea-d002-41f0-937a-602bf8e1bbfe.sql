
CREATE TABLE public.interest_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  whatsapp text,
  business_area text,
  message text,
  source text DEFAULT 'landing',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.interest_leads TO anon;
GRANT INSERT ON public.interest_leads TO authenticated;
GRANT ALL ON public.interest_leads TO service_role;

ALTER TABLE public.interest_leads ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can submit a lead
CREATE POLICY "Anyone can submit interest lead"
  ON public.interest_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(name) BETWEEN 1 AND 200
    AND char_length(email) BETWEEN 3 AND 320
    AND (whatsapp IS NULL OR char_length(whatsapp) <= 40)
    AND (business_area IS NULL OR char_length(business_area) <= 100)
    AND (message IS NULL OR char_length(message) <= 2000)
  );

-- Only super_admin can read/manage
CREATE POLICY "Super admin can view leads"
  ON public.interest_leads
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin can update leads"
  ON public.interest_leads
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin can delete leads"
  ON public.interest_leads
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_interest_leads_created_at ON public.interest_leads (created_at DESC);
