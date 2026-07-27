
-- Revoke direct SELECT on plaintext `token` columns while keeping other columns readable.
-- Service role (edge functions) bypasses grants and continues to work.

-- professional_whatsapp_credentials
REVOKE SELECT ON public.professional_whatsapp_credentials FROM authenticated, anon;
GRANT SELECT (id, professional_id, api_url, instance_id, is_active, last_checked_at, last_connected_at, created_at, updated_at, account_owner_id, token_encrypted)
  ON public.professional_whatsapp_credentials TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.professional_whatsapp_credentials TO authenticated;
GRANT ALL ON public.professional_whatsapp_credentials TO service_role;

-- ultramsg_instance_pool
REVOKE SELECT ON public.ultramsg_instance_pool FROM authenticated, anon;
GRANT SELECT (id, api_url, instance_id, status, assigned_professional_id, assigned_at, notes, created_at, updated_at, monthly_cost_usd, activated_at, token_encrypted)
  ON public.ultramsg_instance_pool TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ultramsg_instance_pool TO authenticated;
GRANT ALL ON public.ultramsg_instance_pool TO service_role;
