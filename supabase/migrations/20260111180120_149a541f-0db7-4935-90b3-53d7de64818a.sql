-- Fix 1: Restrict single_sales table to admins and receptionists only
DROP POLICY IF EXISTS "Authenticated users can view single_sales" ON public.single_sales;

CREATE POLICY "Admins and receptionists can view single_sales" 
ON public.single_sales 
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

-- Fix 2: Restrict banks table to admins and receptionists only
DROP POLICY IF EXISTS "Authenticated users can view banks" ON public.banks;

CREATE POLICY "Admins and receptionists can view banks" 
ON public.banks 
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role)
);

-- Fix 3: Fix storage bucket policies for client-documents
DROP POLICY IF EXISTS "Authenticated users can view client documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update client documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete client documents storage" ON storage.objects;

-- Admins and receptionists: full access to all documents
CREATE POLICY "Admins and receptionists full access to client documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'client-documents' AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'client-documents' AND
  (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'receptionist'::app_role)
  )
);

-- Professionals: only assigned clients (folder structure: client_id/...)
CREATE POLICY "Professionals access assigned client documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'client-documents' AND
  has_role(auth.uid(), 'professional'::app_role) AND
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id::text = split_part(name, '/', 1)
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) OR c.assigned_professional_id IS NULL)
  )
)
WITH CHECK (
  bucket_id = 'client-documents' AND
  has_role(auth.uid(), 'professional'::app_role) AND
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id::text = split_part(name, '/', 1)
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) OR c.assigned_professional_id IS NULL)
  )
);