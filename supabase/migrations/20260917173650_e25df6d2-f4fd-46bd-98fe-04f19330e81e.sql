CREATE POLICY "Professionals can insert own client package sales"
ON public.single_sales
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND created_by = auth.uid()
  AND (client_id IS NULL OR can_access_client_record(client_id))
);