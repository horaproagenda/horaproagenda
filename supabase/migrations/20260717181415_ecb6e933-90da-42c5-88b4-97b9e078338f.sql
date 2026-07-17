
-- Tighten professional_whatsapp_credentials: remove admin-wide access to
-- other professionals' API tokens within the same tenant. Each professional
-- may only read/write their own credential row.
DROP POLICY IF EXISTS "tenant_professional_whatsapp_credentials" ON public.professional_whatsapp_credentials;

CREATE POLICY "own_professional_whatsapp_credentials"
ON public.professional_whatsapp_credentials
FOR ALL
TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND professional_id = get_professional_id_for_user(auth.uid())
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND professional_id = get_professional_id_for_user(auth.uid())
);
