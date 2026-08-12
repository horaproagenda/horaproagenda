CREATE OR REPLACE VIEW public.professional_whatsapp_status AS
SELECT
  c.professional_id,
  c.account_owner_id,
  c.instance_id,
  c.is_active,
  c.last_connected_at,
  c.last_checked_at,
  c.updated_at
FROM public.professional_whatsapp_credentials c
WHERE c.account_owner_id = public.current_account_owner_id()
  AND public.assert_not_super_admin_reading_tenant();

REVOKE ALL ON public.professional_whatsapp_status FROM anon;
GRANT SELECT ON public.professional_whatsapp_status TO authenticated;
GRANT SELECT ON public.professional_whatsapp_status TO service_role;

COMMENT ON VIEW public.professional_whatsapp_status IS
  'Status de conexão do WhatsApp por profissional, sem colunas sensíveis (token/token_encrypted). Escopo restrito à conta do usuário autenticado.';