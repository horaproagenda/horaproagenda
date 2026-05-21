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

  IF _file_path IS NULL OR btrim(_file_path) = '' THEN
    RAISE EXCEPTION 'Arquivo obrigatório para salvar foto.' USING ERRCODE = '23502';
  END IF;

  IF split_part(_file_path, '/', 1) <> _client_id::text THEN
    RAISE EXCEPTION 'Caminho do arquivo não pertence ao cliente informado.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Sem permissão para salvar fotos deste cliente.' USING ERRCODE = '42501';
  END IF;

  IF _appointment_id IS NOT NULL THEN
    SELECT a.client_id
      INTO v_appointment_client_id
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
    _file_path,
    _file_url,
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    COALESCE(_taken_at, now())
  )
  RETURNING * INTO v_photo;

  RETURN v_photo;
END;
$$;

REVOKE ALL ON FUNCTION public.create_treatment_photo(uuid, uuid, public.treatment_stage, text, text, text, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_treatment_photo(uuid, uuid, public.treatment_stage, text, text, text, timestamp with time zone) TO authenticated;

DROP POLICY IF EXISTS "Authorized users can insert treatment photos" ON public.treatment_photos;
CREATE POLICY "Authorized users can insert treatment photos"
ON public.treatment_photos
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.can_access_client_record(client_id)
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

CREATE OR REPLACE FUNCTION public.can_upload_client_storage_object(_bucket_id text, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _bucket_id IN ('client-photos', 'client-documents')
    AND auth.uid() IS NOT NULL
    AND split_part(COALESCE(_object_name, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.can_access_client_record(split_part(_object_name, '/', 1)::uuid)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_upload_client_storage_object(text, text) TO authenticated;