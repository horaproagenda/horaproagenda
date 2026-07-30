ALTER TABLE public.professional_whatsapp_credentials
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'ultramsg';

DROP FUNCTION IF EXISTS public.get_professional_whatsapp_token(uuid);

CREATE OR REPLACE FUNCTION public.get_professional_whatsapp_token(_professional_id uuid)
 RETURNS TABLE(api_url text, instance_id text, token text, is_active boolean, provider text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'extensions'
AS $function$
DECLARE k text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT decrypted_secret INTO k
    FROM vault.decrypted_secrets
   WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;
  RETURN QUERY
    SELECT c.api_url,
           c.instance_id,
           CASE WHEN c.token_encrypted IS NOT NULL
                THEN extensions.pgp_sym_decrypt(c.token_encrypted, k)
                ELSE c.token END,
           c.is_active,
           c.provider
    FROM public.professional_whatsapp_credentials c
   WHERE c.professional_id = _professional_id;
END;
$function$;