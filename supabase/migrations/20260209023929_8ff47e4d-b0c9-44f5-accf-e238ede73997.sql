-- Fix STORAGE_EXPOSURE: Make client-photos bucket private and add proper RLS policies

-- 1. Make client-photos bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'client-photos';

-- 2. Drop existing overly permissive policies
DROP POLICY IF EXISTS "Client photos are publicly accessible" ON storage.objects;

-- 3. Create role-based access policies for client-photos bucket

-- Admin/receptionist: full SELECT access
CREATE POLICY "Admins and receptionists can view all client photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'receptionist'::public.app_role))
);

-- Professional: view photos for assigned clients
CREATE POLICY "Professionals can view assigned client photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  public.has_role(auth.uid(), 'professional'::public.app_role) AND
  EXISTS (
    SELECT 1 FROM public.treatment_photos tp
    JOIN public.clients c ON c.id = tp.client_id
    WHERE tp.file_path = name AND
    (c.assigned_professional_id = public.get_professional_id_for_user(auth.uid()) OR c.assigned_professional_id IS NULL)
  )
);

-- Admin/receptionist: full INSERT access
CREATE POLICY "Admins and receptionists can upload client photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-photos' AND
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'receptionist'::public.app_role))
);

-- Professional: can upload photos for assigned clients
CREATE POLICY "Professionals can upload assigned client photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-photos' AND
  public.has_role(auth.uid(), 'professional'::public.app_role)
);

-- Admin/receptionist: full UPDATE access
CREATE POLICY "Admins and receptionists can update client photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'receptionist'::public.app_role))
);

-- Admin only: DELETE access
CREATE POLICY "Admins can delete client photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Receptionist: DELETE access for client photos
CREATE POLICY "Receptionists can delete client photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-photos' AND
  public.has_role(auth.uid(), 'receptionist'::public.app_role)
);