
CREATE TABLE IF NOT EXISTS public.ultramsg_instance_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_url TEXT,
  instance_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free','assigned','disabled')),
  assigned_professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ultramsg_pool_status ON public.ultramsg_instance_pool(status) WHERE status = 'free';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ultramsg_pool_assigned_unique
  ON public.ultramsg_instance_pool(assigned_professional_id)
  WHERE assigned_professional_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ultramsg_instance_pool TO authenticated;
GRANT ALL ON public.ultramsg_instance_pool TO service_role;

ALTER TABLE public.ultramsg_instance_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view ultramsg pool" ON public.ultramsg_instance_pool
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage ultramsg pool" ON public.ultramsg_instance_pool
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_ultramsg_pool_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ultramsg_pool_updated_at ON public.ultramsg_instance_pool;
CREATE TRIGGER trg_ultramsg_pool_updated_at
  BEFORE UPDATE ON public.ultramsg_instance_pool
  FOR EACH ROW EXECUTE FUNCTION public.set_ultramsg_pool_updated_at();

-- Atomic claim: returns the row that was assigned (or NULL if pool empty).
CREATE OR REPLACE FUNCTION public.claim_ultramsg_pool_instance(p_professional_id UUID)
RETURNS TABLE (
  id UUID, api_url TEXT, instance_id TEXT, token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing UUID;
  v_row RECORD;
BEGIN
  -- If this professional already has an assigned pool instance, return it (idempotent).
  SELECT p.id INTO v_existing
  FROM public.ultramsg_instance_pool p
  WHERE p.assigned_professional_id = p_professional_id
    AND p.status = 'assigned'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY
      SELECT p.id, p.api_url, p.instance_id, p.token
      FROM public.ultramsg_instance_pool p
      WHERE p.id = v_existing;
    RETURN;
  END IF;

  -- Atomically claim next free instance.
  SELECT * INTO v_row
  FROM public.ultramsg_instance_pool
  WHERE status = 'free'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_row IS NULL THEN
    RETURN; -- empty result => caller knows pool is empty
  END IF;

  UPDATE public.ultramsg_instance_pool
  SET status = 'assigned',
      assigned_professional_id = p_professional_id,
      assigned_at = now()
  WHERE id = v_row.id;

  RETURN QUERY
    SELECT v_row.id, v_row.api_url, v_row.instance_id, v_row.token;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ultramsg_pool_instance(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_ultramsg_pool_instance(UUID) TO service_role;
