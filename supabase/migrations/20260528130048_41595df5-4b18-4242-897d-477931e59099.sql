
-- 1. Add registration_source to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'manual';

-- 2. Create client_registration_links
CREATE TABLE IF NOT EXISTS public.client_registration_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  expires_at timestamptz,
  single_use boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_registration_links_token ON public.client_registration_links(token);
CREATE INDEX IF NOT EXISTS idx_client_registration_links_professional ON public.client_registration_links(professional_id);

-- 3. Grants. Token-based public access uses SECURITY DEFINER RPC + edge function, so no anon grant needed.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_registration_links TO authenticated;
GRANT ALL ON public.client_registration_links TO service_role;

-- 4. RLS
ALTER TABLE public.client_registration_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/recepção veem todos os links"
ON public.client_registration_links FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

CREATE POLICY "Profissionais criam seus próprios links"
ON public.client_registration_links FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

CREATE POLICY "Profissionais atualizam seus próprios links"
ON public.client_registration_links FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

CREATE POLICY "Profissionais excluem seus próprios links"
ON public.client_registration_links FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

-- 5. Trigger updated_at
CREATE TRIGGER trg_client_registration_links_updated_at
BEFORE UPDATE ON public.client_registration_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Public RPC to fetch link metadata by token (for the public registration page)
CREATE OR REPLACE FUNCTION public.get_client_registration_link_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.client_registration_links%ROWTYPE;
  v_professional jsonb;
  v_templates jsonb;
BEGIN
  SELECT * INTO rec
  FROM public.client_registration_links
  WHERE token = p_token
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT jsonb_build_object('id', p.id, 'name', p.name)
  INTO v_professional
  FROM public.professionals p
  WHERE p.id = rec.professional_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'content', t.content, 'variables', t.variables) ORDER BY t.title), '[]'::jsonb)
  INTO v_templates
  FROM public.document_templates t
  WHERE t.id = ANY(COALESCE(rec.template_ids, '{}'::uuid[]));

  RETURN jsonb_build_object(
    'id', rec.id,
    'token', rec.token,
    'expires_at', rec.expires_at,
    'single_use', rec.single_use,
    'already_used', rec.used_at IS NOT NULL,
    'professional', v_professional,
    'templates', v_templates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_registration_link_by_token(text) TO anon, authenticated;
