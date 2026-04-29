-- Harden client photo/document access to authorized staff and procedure professionals

CREATE OR REPLACE FUNCTION public.can_access_client_record(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
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

CREATE OR REPLACE FUNCTION public.can_access_client_photo(_photo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.treatment_photos tp
    WHERE tp.id = _photo_id
      AND (
        public.can_access_client_record(tp.client_id)
        OR EXISTS (
          SELECT 1
          FROM public.appointments a
          WHERE a.id = tp.appointment_id
            AND a.professional_id = public.get_professional_id_for_user(auth.uid())
        )
      )
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
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
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
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
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

-- Table policies: client_documents
DROP POLICY IF EXISTS "Users can view client documents based on role" ON public.client_documents;
DROP POLICY IF EXISTS "Users can update client documents based on role" ON public.client_documents;
DROP POLICY IF EXISTS "Authenticated users can insert client documents" ON public.client_documents;
DROP POLICY IF EXISTS "Admins can delete client documents" ON public.client_documents;

CREATE POLICY "Authorized users can view client documents"
ON public.client_documents
FOR SELECT
TO authenticated
USING (public.can_access_client_record(client_id));

CREATE POLICY "Authorized staff can insert client documents"
ON public.client_documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR public.can_access_client_record(client_id)
);

CREATE POLICY "Authorized staff can update client documents"
ON public.client_documents
FOR UPDATE
TO authenticated
USING (public.can_access_client_record(client_id))
WITH CHECK (public.can_access_client_record(client_id));

CREATE POLICY "Only admins can delete client documents"
ON public.client_documents
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Table policies: treatment_photos
DROP POLICY IF EXISTS "Users can view treatment photos based on role" ON public.treatment_photos;
DROP POLICY IF EXISTS "Users can update treatment photos based on role" ON public.treatment_photos;
DROP POLICY IF EXISTS "Authenticated users can insert treatment photos" ON public.treatment_photos;
DROP POLICY IF EXISTS "Admins can delete treatment photos" ON public.treatment_photos;

CREATE POLICY "Authorized users can view treatment photos"
ON public.treatment_photos
FOR SELECT
TO authenticated
USING (public.can_access_client_photo(id));

CREATE POLICY "Authorized staff can insert treatment photos"
ON public.treatment_photos
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR public.can_access_client_record(client_id)
);

CREATE POLICY "Authorized staff can update treatment photos"
ON public.treatment_photos
FOR UPDATE
TO authenticated
USING (public.can_access_client_photo(id))
WITH CHECK (public.can_access_client_record(client_id));

CREATE POLICY "Only admins can delete treatment photos"
ON public.treatment_photos
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Storage policies for private client photos/documents
UPDATE storage.buckets
SET public = false
WHERE id IN ('client-photos', 'client-documents');

DROP POLICY IF EXISTS "Admins and receptionists can view all client photos" ON storage.objects;
DROP POLICY IF EXISTS "Professionals can view assigned client photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins and receptionists can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Professionals can upload assigned client photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins and receptionists can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Receptionists can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins and receptionists full access to client documents" ON storage.objects;
DROP POLICY IF EXISTS "Professionals access assigned client documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;
DROP POLICY IF EXISTS "Client photos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view client documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete client documents storage" ON storage.objects;

CREATE POLICY "Authorized users can view client protected files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.can_access_client_storage_object(bucket_id, name)
);

CREATE POLICY "Authorized staff can upload client protected files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('client-photos', 'client-documents')
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR public.can_access_client_storage_object(bucket_id, name)
  )
);

CREATE POLICY "Authorized staff can update client protected files"
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

CREATE POLICY "Only admins can delete client protected files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('client-photos', 'client-documents')
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);