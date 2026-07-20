ALTER TABLE public.ultramsg_instance_pool
  ALTER COLUMN token DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.encrypt_whatsapp_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE k text;
BEGIN
  IF NEW.token IS NOT NULL AND length(NEW.token) > 0 THEN
    SELECT decrypted_secret INTO k
      FROM vault.decrypted_secrets
     WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;
    IF k IS NULL THEN
      RAISE EXCEPTION 'whatsapp_credentials_encryption_key not configured in Vault';
    END IF;
    NEW.token_encrypted := extensions.pgp_sym_encrypt(NEW.token, k);
    NEW.token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

GRANT INSERT (token), UPDATE (token) ON public.ultramsg_instance_pool TO authenticated;
REVOKE SELECT (token, token_encrypted) ON public.ultramsg_instance_pool FROM authenticated, anon;