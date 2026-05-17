-- 1) Loosen storage INSERT/UPDATE so any user with access to the client can upload
CREATE OR REPLACE FUNCTION public.can_upload_client_storage_object(_bucket_id text, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _bucket_id IN ('client-photos', 'client-documents')
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR (
        -- client_id is the first path segment
        split_part(_object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND public.can_access_client_record(split_part(_object_name, '/', 1)::uuid)
      )
    );
$$;

DROP POLICY IF EXISTS "Authorized users can upload client protected files" ON storage.objects;
CREATE POLICY "Authorized users can upload client protected files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (public.can_upload_client_storage_object(bucket_id, name));

DROP POLICY IF EXISTS "Authorized users can update client protected files" ON storage.objects;
CREATE POLICY "Authorized users can update client protected files"
ON storage.objects FOR UPDATE TO authenticated
USING (public.can_upload_client_storage_object(bucket_id, name))
WITH CHECK (public.can_upload_client_storage_object(bucket_id, name));

-- 2) Authenticated prefill RPC: returns full snapshot only when CPF matches
CREATE OR REPLACE FUNCTION public.authenticate_document_fill_link(p_token text, p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec public.document_fill_links%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_prof public.professionals%ROWTYPE;
  v_provided text;
  v_stored text;
BEGIN
  SELECT * INTO rec
  FROM public.document_fill_links
  WHERE token = p_token
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
  IF rec.client_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_CLIENT'); END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = rec.client_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NO_CLIENT'); END IF;

  v_provided := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_stored := regexp_replace(COALESCE(v_client.cpf, ''), '\D', '', 'g');

  IF length(v_stored) <> 11 OR v_provided <> v_stored THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CPF_MISMATCH');
  END IF;

  IF rec.professional_id IS NOT NULL THEN
    SELECT * INTO v_prof FROM public.professionals WHERE id = rec.professional_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'client', jsonb_build_object(
      'id', v_client.id,
      'name', v_client.name,
      'cpf', v_client.cpf,
      'phone', v_client.phone,
      'birthdate', v_client.birthdate,
      'email', v_client.email
    ),
    'professional', CASE WHEN v_prof.id IS NOT NULL
      THEN jsonb_build_object('id', v_prof.id, 'name', v_prof.name)
      ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.authenticate_document_fill_link(text, text) TO anon, authenticated;