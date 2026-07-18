
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Store encryption key in Vault if not already present
DO $$
DECLARE existing uuid;
BEGIN
  SELECT id INTO existing FROM vault.secrets WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;
  IF existing IS NULL THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'whatsapp_credentials_encryption_key',
      'AES-256 key used to encrypt WhatsApp API tokens at rest'
    );
  END IF;
END $$;

-- Add encrypted columns
ALTER TABLE public.professional_whatsapp_credentials
  ADD COLUMN IF NOT EXISTS token_encrypted bytea;

ALTER TABLE public.ultramsg_instance_pool
  ADD COLUMN IF NOT EXISTS token_encrypted bytea;

-- Encrypt trigger
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

DROP TRIGGER IF EXISTS trg_encrypt_prof_wa_token ON public.professional_whatsapp_credentials;
CREATE TRIGGER trg_encrypt_prof_wa_token
BEFORE INSERT OR UPDATE ON public.professional_whatsapp_credentials
FOR EACH ROW EXECUTE FUNCTION public.encrypt_whatsapp_token();

DROP TRIGGER IF EXISTS trg_encrypt_ultramsg_pool_token ON public.ultramsg_instance_pool;
CREATE TRIGGER trg_encrypt_ultramsg_pool_token
BEFORE INSERT OR UPDATE ON public.ultramsg_instance_pool
FOR EACH ROW EXECUTE FUNCTION public.encrypt_whatsapp_token();

-- Backfill existing plaintext tokens
DO $$
DECLARE k text;
BEGIN
  SELECT decrypted_secret INTO k
    FROM vault.decrypted_secrets
   WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;

  UPDATE public.professional_whatsapp_credentials
     SET token_encrypted = extensions.pgp_sym_encrypt(token, k),
         token = NULL
   WHERE token IS NOT NULL AND length(token) > 0;

  UPDATE public.ultramsg_instance_pool
     SET token_encrypted = extensions.pgp_sym_encrypt(token, k),
         token = NULL
   WHERE token IS NOT NULL AND length(token) > 0;
END $$;

-- Revoke direct read of token/token_encrypted from clients
REVOKE SELECT (token, token_encrypted) ON public.professional_whatsapp_credentials FROM anon, authenticated;
REVOKE SELECT (token, token_encrypted) ON public.ultramsg_instance_pool FROM anon, authenticated;

-- Decryption RPCs (service role / super admin only)
CREATE OR REPLACE FUNCTION public.get_professional_whatsapp_token(_professional_id uuid)
RETURNS TABLE(api_url text, instance_id text, token text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
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
           c.is_active
    FROM public.professional_whatsapp_credentials c
   WHERE c.professional_id = _professional_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ultramsg_pool_assigned()
RETURNS TABLE(id uuid, api_url text, instance_id text, token text, assigned_professional_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE k text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT decrypted_secret INTO k
    FROM vault.decrypted_secrets
   WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;
  RETURN QUERY
    SELECT p.id, p.api_url, p.instance_id,
           CASE WHEN p.token_encrypted IS NOT NULL
                THEN extensions.pgp_sym_decrypt(p.token_encrypted, k)
                ELSE p.token END,
           p.assigned_professional_id
    FROM public.ultramsg_instance_pool p
   WHERE p.status = 'assigned';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ultramsg_pool_row(_id uuid)
RETURNS TABLE(id uuid, api_url text, instance_id text, token text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE k text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT decrypted_secret INTO k
    FROM vault.decrypted_secrets
   WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;
  RETURN QUERY
    SELECT p.id, p.api_url, p.instance_id,
           CASE WHEN p.token_encrypted IS NOT NULL
                THEN extensions.pgp_sym_decrypt(p.token_encrypted, k)
                ELSE p.token END
    FROM public.ultramsg_instance_pool p
   WHERE p.id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_professional_whatsapp_token(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ultramsg_pool_assigned() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ultramsg_pool_row(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_whatsapp_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ultramsg_pool_assigned() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ultramsg_pool_row(uuid) TO service_role;
