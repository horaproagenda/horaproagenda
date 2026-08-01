CREATE TABLE public.pricing_cache (
  lookup_key TEXT PRIMARY KEY,
  price_id TEXT NOT NULL,
  unit_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'brl',
  interval_months INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pricing_cache TO anon;
GRANT SELECT ON public.pricing_cache TO authenticated;
GRANT ALL ON public.pricing_cache TO service_role;

ALTER TABLE public.pricing_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_cache_public_read"
ON public.pricing_cache
FOR SELECT
TO anon, authenticated
USING (true);

CREATE TRIGGER update_pricing_cache_updated_at
BEFORE UPDATE ON public.pricing_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pricing_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pricing_cache;