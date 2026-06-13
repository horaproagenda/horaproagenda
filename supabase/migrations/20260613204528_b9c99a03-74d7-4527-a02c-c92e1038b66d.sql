
-- 1) Singleton config table for USD -> BRL rate
CREATE TABLE IF NOT EXISTS public.whatsapp_pricing_config (
  id boolean PRIMARY KEY DEFAULT true,
  usd_to_brl_rate numeric(10,4) NOT NULL DEFAULT 5.50,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_pricing_config_singleton CHECK (id = true)
);

GRANT SELECT ON public.whatsapp_pricing_config TO authenticated;
GRANT ALL ON public.whatsapp_pricing_config TO service_role;

ALTER TABLE public.whatsapp_pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read pricing config" ON public.whatsapp_pricing_config;
CREATE POLICY "Authenticated can read pricing config" ON public.whatsapp_pricing_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage pricing config" ON public.whatsapp_pricing_config;
CREATE POLICY "Admins manage pricing config" ON public.whatsapp_pricing_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed singleton row
INSERT INTO public.whatsapp_pricing_config (id, usd_to_brl_rate)
VALUES (true, 5.50)
ON CONFLICT (id) DO NOTHING;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_whatsapp_pricing_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_whatsapp_pricing_config ON public.whatsapp_pricing_config;
CREATE TRIGGER trg_touch_whatsapp_pricing_config
BEFORE UPDATE ON public.whatsapp_pricing_config
FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_pricing_config();

-- 2) Security-definer RPC: cost in BRL for N professionals
CREATE OR REPLACE FUNCTION public.get_whatsapp_instance_cost_brl(qty integer)
RETURNS TABLE (
  qty_out integer,
  unit_usd numeric,
  rate numeric,
  unit_brl numeric,
  total_brl numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_usd numeric;
  v_rate numeric;
BEGIN
  IF qty IS NULL OR qty < 1 THEN
    qty := 1;
  END IF;

  SELECT t.unit_price_usd INTO v_unit_usd
  FROM public.whatsapp_volume_pricing_tiers t
  WHERE t.active
    AND qty >= t.min_quantity
    AND (t.max_quantity IS NULL OR qty <= t.max_quantity)
  ORDER BY t.min_quantity DESC
  LIMIT 1;

  IF v_unit_usd IS NULL THEN
    v_unit_usd := 0;
  END IF;

  SELECT c.usd_to_brl_rate INTO v_rate FROM public.whatsapp_pricing_config c WHERE c.id = true;
  IF v_rate IS NULL THEN
    v_rate := 5.50;
  END IF;

  qty_out := qty;
  unit_usd := v_unit_usd;
  rate := v_rate;
  unit_brl := round(v_unit_usd * v_rate, 2);
  total_brl := round(v_unit_usd * v_rate * qty, 2);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_instance_cost_brl(integer) TO authenticated, anon;
