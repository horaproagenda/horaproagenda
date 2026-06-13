
ALTER TABLE public.ultramsg_instance_pool
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ NULL;

UPDATE public.ultramsg_instance_pool
SET activated_at = COALESCE(assigned_at, now())
WHERE status = 'assigned' AND activated_at IS NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_volume_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_quantity INT NOT NULL CHECK (min_quantity >= 1),
  max_quantity INT NULL CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
  unit_price_usd NUMERIC(10,2) NOT NULL CHECK (unit_price_usd >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_volume_pricing_tiers TO authenticated;
GRANT ALL ON public.whatsapp_volume_pricing_tiers TO service_role;

ALTER TABLE public.whatsapp_volume_pricing_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read pricing tiers" ON public.whatsapp_volume_pricing_tiers;
CREATE POLICY "Admins can read pricing tiers" ON public.whatsapp_volume_pricing_tiers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert pricing tiers" ON public.whatsapp_volume_pricing_tiers;
CREATE POLICY "Admins can insert pricing tiers" ON public.whatsapp_volume_pricing_tiers
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update pricing tiers" ON public.whatsapp_volume_pricing_tiers;
CREATE POLICY "Admins can update pricing tiers" ON public.whatsapp_volume_pricing_tiers
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete pricing tiers" ON public.whatsapp_volume_pricing_tiers;
CREATE POLICY "Admins can delete pricing tiers" ON public.whatsapp_volume_pricing_tiers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_whatsapp_volume_pricing_tiers()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_whatsapp_volume_pricing_tiers ON public.whatsapp_volume_pricing_tiers;
CREATE TRIGGER trg_touch_whatsapp_volume_pricing_tiers
  BEFORE UPDATE ON public.whatsapp_volume_pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_volume_pricing_tiers();

INSERT INTO public.whatsapp_volume_pricing_tiers (min_quantity, max_quantity, unit_price_usd, active)
SELECT * FROM (VALUES
  (1, 4, 9.00, true),
  (5, 9, 8.00, true),
  (10, 24, 7.00, true),
  (25, NULL::int, 6.00, true)
) AS v(min_quantity, max_quantity, unit_price_usd, active)
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_volume_pricing_tiers);

CREATE OR REPLACE FUNCTION public.get_whatsapp_unit_price(qty INT)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_price_usd
  FROM public.whatsapp_volume_pricing_tiers
  WHERE active AND qty >= min_quantity
    AND (max_quantity IS NULL OR qty <= max_quantity)
  ORDER BY min_quantity DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_unit_price(INT) TO authenticated, service_role;

-- Drop old claim function (return type changing)
DROP FUNCTION IF EXISTS public.claim_ultramsg_pool_instance(UUID);

CREATE FUNCTION public.claim_ultramsg_pool_instance(p_professional_id UUID)
RETURNS TABLE(id UUID, instance_id TEXT, token TEXT, api_url TEXT, activated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.ultramsg_instance_pool%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ultramsg_instance_pool
  WHERE assigned_professional_id = p_professional_id AND status = 'assigned' LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.instance_id, v_row.token, v_row.api_url, v_row.activated_at;
    RETURN;
  END IF;

  UPDATE public.ultramsg_instance_pool
  SET status = 'assigned',
      assigned_professional_id = p_professional_id,
      assigned_at = now(),
      activated_at = now()
  WHERE id = (
    SELECT id FROM public.ultramsg_instance_pool
    WHERE status = 'free'
    ORDER BY created_at ASC NULLS LAST, id
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO v_row;

  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_row.id, v_row.instance_id, v_row.token, v_row.api_url, v_row.activated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ultramsg_pool_instance(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_ultramsg_pool_instance(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reset_ultramsg_activated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'assigned' AND OLD.status = 'assigned' THEN
    NEW.activated_at := NULL;
    NEW.assigned_professional_id := NULL;
    NEW.assigned_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_ultramsg_activated_at ON public.ultramsg_instance_pool;
CREATE TRIGGER trg_reset_ultramsg_activated_at
  BEFORE UPDATE OF status ON public.ultramsg_instance_pool
  FOR EACH ROW EXECUTE FUNCTION public.reset_ultramsg_activated_at();
