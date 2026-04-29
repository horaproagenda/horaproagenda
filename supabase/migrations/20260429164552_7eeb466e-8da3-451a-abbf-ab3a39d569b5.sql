-- Refine protected client media/document authorization: admin + assigned/procedure professional only

CREATE OR REPLACE FUNCTION public.can_access_client_record(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = _client_id
        AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.client_id = _client_id
        AND a.professional_id = public.get_professional_id_for_user(auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_client_storage_object(_bucket_id text, _object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _bucket_id = 'client-photos' THEN
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.treatment_photos tp
        LEFT JOIN public.appointments a ON a.id = tp.appointment_id
        WHERE tp.file_path = _object_name
          AND (
            public.can_access_client_record(tp.client_id)
            OR a.professional_id = public.get_professional_id_for_user(auth.uid())
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id::text = split_part(_object_name, '/', 1)
          AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
      )
    WHEN _bucket_id = 'client-documents' THEN
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.client_documents cd
        WHERE cd.file_path = _object_name
          AND public.can_access_client_record(cd.client_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id::text = split_part(_object_name, '/', 1)
          AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
      )
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "Authorized staff can insert client documents" ON public.client_documents;
CREATE POLICY "Authorized users can insert client documents"
ON public.client_documents
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_client_record(client_id));

DROP POLICY IF EXISTS "Authorized staff can update client documents" ON public.client_documents;
CREATE POLICY "Authorized users can update client documents"
ON public.client_documents
FOR UPDATE
TO authenticated
USING (public.can_access_client_record(client_id))
WITH CHECK (public.can_access_client_record(client_id));

DROP POLICY IF EXISTS "Authorized staff can insert treatment photos" ON public.treatment_photos;
CREATE POLICY "Authorized users can insert treatment photos"
ON public.treatment_photos
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_client_record(client_id));

DROP POLICY IF EXISTS "Authorized staff can update treatment photos" ON public.treatment_photos;
CREATE POLICY "Authorized users can update treatment photos"
ON public.treatment_photos
FOR UPDATE
TO authenticated
USING (public.can_access_client_photo(id))
WITH CHECK (public.can_access_client_record(client_id));

DROP POLICY IF EXISTS "Authorized staff can upload client protected files" ON storage.objects;
CREATE POLICY "Authorized users can upload client protected files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.can_access_client_storage_object(bucket_id, name)
);

DROP POLICY IF EXISTS "Authorized staff can update client protected files" ON storage.objects;
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
  AND public.can_access_client_storage_object(bucket_id, name)
);