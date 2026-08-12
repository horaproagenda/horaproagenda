ALTER VIEW public.professional_whatsapp_status SET (security_invoker = on);

GRANT SELECT (
  id,
  professional_id,
  account_owner_id,
  instance_id,
  is_active,
  last_connected_at,
  last_checked_at,
  created_at,
  updated_at
) ON public.professional_whatsapp_credentials TO authenticated;

REVOKE SELECT (token) ON public.professional_whatsapp_credentials FROM authenticated, anon;
REVOKE SELECT (token_encrypted) ON public.professional_whatsapp_credentials FROM authenticated, anon;