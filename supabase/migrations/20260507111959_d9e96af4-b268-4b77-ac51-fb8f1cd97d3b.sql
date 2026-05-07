-- 1) business_settings: somente admin/recepção podem ler
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.business_settings;
DROP POLICY IF EXISTS "Authenticated users can view business settings" ON public.business_settings;
DROP POLICY IF EXISTS "All authenticated can view settings" ON public.business_settings;
DROP POLICY IF EXISTS "Anyone authenticated can view business_settings" ON public.business_settings;

CREATE POLICY "Admins and receptionists can view business settings"
ON public.business_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
);

-- 2) document_fill_links: profissional responsável pelo cliente também pode ler/gerenciar
CREATE POLICY "Professionals can view own client fill links"
ON public.document_fill_links
FOR SELECT
TO authenticated
USING (
  client_id IS NOT NULL
  AND public.can_access_client_record(client_id)
);

CREATE POLICY "Professionals can create fill links for own clients"
ON public.document_fill_links
FOR INSERT
TO authenticated
WITH CHECK (
  client_id IS NOT NULL
  AND public.can_access_client_record(client_id)
);

CREATE POLICY "Professionals can update fill links for own clients"
ON public.document_fill_links
FOR UPDATE
TO authenticated
USING (
  client_id IS NOT NULL
  AND public.can_access_client_record(client_id)
)
WITH CHECK (
  client_id IS NOT NULL
  AND public.can_access_client_record(client_id)
);

CREATE POLICY "Professionals can delete fill links for own clients"
ON public.document_fill_links
FOR DELETE
TO authenticated
USING (
  client_id IS NOT NULL
  AND public.can_access_client_record(client_id)
);