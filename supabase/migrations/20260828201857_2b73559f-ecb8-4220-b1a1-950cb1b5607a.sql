CREATE TABLE public.billing_payment_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seats INTEGER NOT NULL,
  billing_months INTEGER NOT NULL,
  cycle_key TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  asaas_payment_link_id TEXT,
  url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_payment_links_seats_months_key
  ON public.billing_payment_links (seats, billing_months);

GRANT SELECT ON public.billing_payment_links TO authenticated;
GRANT ALL ON public.billing_payment_links TO service_role;

ALTER TABLE public.billing_payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read billing payment links"
ON public.billing_payment_links
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_billing_payment_links_updated_at
BEFORE UPDATE ON public.billing_payment_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();