CREATE OR REPLACE FUNCTION public.get_client_registration_link_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.client_registration_links%ROWTYPE;
  v_professional jsonb;
  v_templates jsonb;
  v_branding jsonb;
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
  WHERE t.id = ANY(COALESCE(rec.template_ids, '{}'::uuid[]))
    AND COALESCE(t.is_active, true);

  SELECT jsonb_build_object(
    'clinic_name', bs.clinic_name,
    'clinic_logo_url', bs.clinic_logo_url,
    'clinic_phone', bs.clinic_phone,
    'clinic_city', bs.clinic_city,
    'clinic_state', bs.clinic_state
  )
  INTO v_branding
  FROM public.business_settings bs
  WHERE bs.account_owner_id = rec.account_owner_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'id', rec.id,
    'token', rec.token,
    'expires_at', rec.expires_at,
    'single_use', rec.single_use,
    'already_used', rec.used_at IS NOT NULL,
    'professional', v_professional,
    'branding', COALESCE(v_branding, '{}'::jsonb),
    'templates', v_templates
  );
END;
$$;