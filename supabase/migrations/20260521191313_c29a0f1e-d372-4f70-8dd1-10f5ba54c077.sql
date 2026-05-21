CREATE OR REPLACE FUNCTION public.can_upload_client_storage_object(_bucket_id text, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _bucket_id IN ('client-photos', 'client-documents')
    AND auth.uid() IS NOT NULL
    AND split_part(COALESCE(_object_name, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_client_record(split_part(_object_name, '/', 1)::uuid);
$$;

CREATE OR REPLACE FUNCTION public.can_access_client_storage_object(_bucket_id text, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _bucket_id IN ('client-photos', 'client-documents')
    AND auth.uid() IS NOT NULL
    AND split_part(COALESCE(_object_name, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_access_client_record(split_part(_object_name, '/', 1)::uuid);
$$;

REVOKE ALL ON FUNCTION public.can_upload_client_storage_object(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_client_storage_object(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_client_storage_object(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client_storage_object(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_client_document(
  _client_id uuid,
  _type public.document_type,
  _title text,
  _description text DEFAULT NULL,
  _file_path text DEFAULT NULL,
  _file_url text DEFAULT NULL,
  _content text DEFAULT NULL,
  _template_id uuid DEFAULT NULL,
  _filled_variables jsonb DEFAULT NULL,
  _signed_at timestamp with time zone DEFAULT NULL,
  _signed_by text DEFAULT NULL
)
RETURNS public.client_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_document public.client_documents;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para salvar documento.' USING ERRCODE = '28000';
  END IF;

  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente obrigatório para salvar documento.' USING ERRCODE = '23502';
  END IF;

  IF NULLIF(btrim(COALESCE(_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Título obrigatório para salvar documento.' USING ERRCODE = '23502';
  END IF;

  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Sem permissão para salvar documentos deste cliente.' USING ERRCODE = '42501';
  END IF;

  IF _file_path IS NOT NULL AND btrim(_file_path) <> '' AND split_part(_file_path, '/', 1) <> _client_id::text THEN
    RAISE EXCEPTION 'Caminho do arquivo não pertence ao cliente informado.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.client_documents (
    client_id,
    type,
    title,
    description,
    file_path,
    file_url,
    content,
    template_id,
    filled_variables,
    signed_at,
    signed_by
  ) VALUES (
    _client_id,
    COALESCE(_type, 'other'::public.document_type),
    btrim(_title),
    NULLIF(btrim(COALESCE(_description, '')), ''),
    NULLIF(btrim(COALESCE(_file_path, '')), ''),
    NULLIF(btrim(COALESCE(_file_url, '')), ''),
    _content,
    _template_id,
    _filled_variables,
    _signed_at,
    NULLIF(btrim(COALESCE(_signed_by, '')), '')
  )
  RETURNING * INTO v_document;

  RETURN v_document;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_document(uuid, public.document_type, text, text, text, text, text, uuid, jsonb, timestamp with time zone, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_document(uuid, public.document_type, text, text, text, text, text, uuid, jsonb, timestamp with time zone, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_treatment_photo(
  _client_id uuid,
  _appointment_id uuid DEFAULT NULL,
  _stage public.treatment_stage DEFAULT 'before'::public.treatment_stage,
  _file_path text DEFAULT NULL,
  _file_url text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _taken_at timestamp with time zone DEFAULT now()
)
RETURNS public.treatment_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_photo public.treatment_photos;
  v_appointment_client_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para salvar foto.' USING ERRCODE = '28000';
  END IF;

  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Cliente obrigatório para salvar foto.' USING ERRCODE = '23502';
  END IF;

  IF NULLIF(btrim(COALESCE(_file_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Arquivo obrigatório para salvar foto.' USING ERRCODE = '23502';
  END IF;

  IF split_part(_file_path, '/', 1) <> _client_id::text THEN
    RAISE EXCEPTION 'Caminho do arquivo não pertence ao cliente informado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Sem permissão para salvar fotos deste cliente.' USING ERRCODE = '42501';
  END IF;

  IF _appointment_id IS NOT NULL THEN
    SELECT a.client_id INTO v_appointment_client_id
    FROM public.appointments a
    WHERE a.id = _appointment_id;

    IF v_appointment_client_id IS DISTINCT FROM _client_id THEN
      RAISE EXCEPTION 'Agendamento não pertence ao cliente informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.treatment_photos (
    client_id,
    appointment_id,
    stage,
    file_path,
    file_url,
    notes,
    taken_at
  ) VALUES (
    _client_id,
    _appointment_id,
    COALESCE(_stage, 'before'::public.treatment_stage),
    btrim(_file_path),
    NULLIF(btrim(COALESCE(_file_url, '')), ''),
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    COALESCE(_taken_at, now())
  )
  RETURNING * INTO v_photo;

  RETURN v_photo;
END;
$$;

REVOKE ALL ON FUNCTION public.create_treatment_photo(uuid, uuid, public.treatment_stage, text, text, text, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_treatment_photo(uuid, uuid, public.treatment_stage, text, text, text, timestamp with time zone) TO authenticated;

DROP POLICY IF EXISTS "Authorized users can upload client protected files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can update client protected files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view client protected files" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can delete client protected files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Client photos are publicly accessible" ON storage.objects;

CREATE POLICY "Authorized users can view client protected files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.can_access_client_storage_object(bucket_id, name)
);

CREATE POLICY "Authorized users can upload client protected files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.can_upload_client_storage_object(bucket_id, name)
);

CREATE POLICY "Authorized users can update client protected files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.can_access_client_storage_object(bucket_id, name)
)
WITH CHECK (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.can_upload_client_storage_object(bucket_id, name)
);

CREATE POLICY "Only admins can delete client protected files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated users can insert client documents" ON public.client_documents;
DROP POLICY IF EXISTS "Authorized users can insert client documents" ON public.client_documents;
CREATE POLICY "Authorized users can insert client documents"
ON public.client_documents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_client_record(client_id)
  AND (
    file_path IS NULL
    OR split_part(file_path, '/', 1) = client_id::text
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert treatment photos" ON public.treatment_photos;
DROP POLICY IF EXISTS "Authorized users can insert treatment photos" ON public.treatment_photos;
CREATE POLICY "Authorized users can insert treatment photos"
ON public.treatment_photos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_client_record(client_id)
  AND split_part(file_path, '/', 1) = client_id::text
  AND (
    appointment_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.id = appointment_id
        AND a.client_id = treatment_photos.client_id
    )
  )
);