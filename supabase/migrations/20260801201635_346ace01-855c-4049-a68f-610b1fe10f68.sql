-- 1) Storage delete policy: restrict to authenticated
DROP POLICY IF EXISTS "Only admins can delete client protected files" ON storage.objects;
CREATE POLICY "Only admins can delete client protected files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = ANY (ARRAY['client-photos'::text, 'client-documents'::text])
  AND has_role(auth.uid(), 'admin'::app_role)
  AND can_access_client_storage_object(bucket_id, name)
);

-- 2) product_purchases: restrict supplier cost visibility to admin/receptionist
DROP POLICY IF EXISTS "Staff can view product purchases of their tenant" ON public.product_purchases;
CREATE POLICY "Staff can view product purchases of their tenant"
ON public.product_purchases
FOR SELECT
TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
  )
);

-- 3) waitlist select: embed tenant scope for defense in depth
DROP POLICY IF EXISTS "Users can view relevant waitlist" ON public.waitlist;
CREATE POLICY "Users can view relevant waitlist"
ON public.waitlist
FOR SELECT
TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR professional_id = get_professional_id_for_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = waitlist.client_id
        AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
    )
  )
);