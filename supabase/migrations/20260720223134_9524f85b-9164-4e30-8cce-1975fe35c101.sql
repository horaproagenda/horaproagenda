
-- Lock down direct SELECT on WhatsApp token columns. Legitimate reads must go
-- through the SECURITY DEFINER RPCs (get_professional_whatsapp_token,
-- get_ultramsg_pool_assigned) which decrypt via Vault and check caller role.
REVOKE SELECT (token) ON public.professional_whatsapp_credentials FROM authenticated, anon;
REVOKE SELECT (token_encrypted) ON public.professional_whatsapp_credentials FROM authenticated, anon;
REVOKE SELECT (token) ON public.ultramsg_instance_pool FROM authenticated, anon;
REVOKE SELECT (token_encrypted) ON public.ultramsg_instance_pool FROM authenticated, anon;
