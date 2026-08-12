DROP POLICY IF EXISTS "whatsapp_messages_tenant_staff_select" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_tenant_staff_select"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (public.is_tenant_staff() AND account_owner_id = public.current_account_owner_id());