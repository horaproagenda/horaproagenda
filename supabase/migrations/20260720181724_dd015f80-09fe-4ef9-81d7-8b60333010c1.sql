
-- Restrict direct column-level access to sensitive credential fields.
-- Access to these values is provided exclusively via SECURITY DEFINER RPCs.

-- 1) ultramsg_instance_pool.token: never readable/writable directly by app roles.
REVOKE SELECT (token), UPDATE (token), INSERT (token) ON public.ultramsg_instance_pool FROM anon, authenticated;

-- 2) professional_credentials.temp_password: readable only via get_professional_temp_password RPC.
REVOKE SELECT (temp_password), UPDATE (temp_password), INSERT (temp_password) ON public.professional_credentials FROM anon, authenticated;

-- service_role retains full access (edge functions and RPCs continue to work).
GRANT ALL ON public.ultramsg_instance_pool TO service_role;
GRANT ALL ON public.professional_credentials TO service_role;
