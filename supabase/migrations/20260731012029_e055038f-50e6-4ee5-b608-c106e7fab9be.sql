-- 1) ultramsg_instance_pool: eliminar coluna de token em texto puro
CREATE OR REPLACE FUNCTION public.claim_ultramsg_pool_instance(p_professional_id uuid)
RETURNS TABLE(id uuid, instance_id text, token text, api_url text, activated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.ultramsg_instance_pool%ROWTYPE;
  k text;
BEGIN
  SELECT decrypted_secret INTO k
    FROM vault.decrypted_secrets
   WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;

  SELECT * INTO v_row FROM public.ultramsg_instance_pool p
   WHERE p.assigned_professional_id = p_professional_id AND p.status = 'assigned'
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.instance_id,
      CASE WHEN v_row.token_encrypted IS NOT NULL
           THEN extensions.pgp_sym_decrypt(v_row.token_encrypted, k) END,
      v_row.api_url, v_row.activated_at;
    RETURN;
  END IF;

  UPDATE public.ultramsg_instance_pool p
     SET status = 'assigned',
         assigned_professional_id = p_professional_id,
         assigned_at = now(),
         activated_at = now()
   WHERE p.id = (
     SELECT p2.id FROM public.ultramsg_instance_pool p2
      WHERE p2.status = 'free'
      ORDER BY p2.created_at ASC NULLS LAST, p2.id
      LIMIT 1 FOR UPDATE SKIP LOCKED
   )
   RETURNING p.* INTO v_row;

  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_row.id, v_row.instance_id,
    CASE WHEN v_row.token_encrypted IS NOT NULL
         THEN extensions.pgp_sym_decrypt(v_row.token_encrypted, k) END,
    v_row.api_url, v_row.activated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ultramsg_pool_assigned()
RETURNS TABLE(id uuid, api_url text, instance_id text, token text, assigned_professional_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
                THEN extensions.pgp_sym_decrypt(p.token_encrypted, k) END,
           p.assigned_professional_id
    FROM public.ultramsg_instance_pool p
   WHERE p.status = 'assigned';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ultramsg_pool_row(_id uuid)
RETURNS TABLE(id uuid, api_url text, instance_id text, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
                THEN extensions.pgp_sym_decrypt(p.token_encrypted, k) END
    FROM public.ultramsg_instance_pool p
   WHERE p.id = _id;
END;
$$;

-- Trigger de criptografia deixa de ser necessária no pool (sem coluna em claro).
DROP TRIGGER IF EXISTS trg_encrypt_ultramsg_pool_token ON public.ultramsg_instance_pool;
ALTER TABLE public.ultramsg_instance_pool DROP COLUMN IF EXISTS token;

-- Escrita do token em claro passa a ser feita apenas via função segura.
CREATE OR REPLACE FUNCTION public.set_ultramsg_pool_token(_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE k text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT decrypted_secret INTO k
    FROM vault.decrypted_secrets
   WHERE name = 'whatsapp_credentials_encryption_key' LIMIT 1;
  IF k IS NULL THEN
    RAISE EXCEPTION 'whatsapp_credentials_encryption_key not configured in Vault';
  END IF;
  UPDATE public.ultramsg_instance_pool
     SET token_encrypted = extensions.pgp_sym_encrypt(_token, k)
   WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_ultramsg_pool_token(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_ultramsg_pool_token(uuid, text) TO authenticated, service_role;

-- 2) professional_credentials: revogar leitura direta da senha temporária
REVOKE SELECT ON public.professional_credentials FROM anon, authenticated;
GRANT SELECT (professional_id, user_id, must_change_password, set_at, set_by, password_changed_at, updated_at, account_owner_id)
  ON public.professional_credentials TO authenticated;
GRANT ALL ON public.professional_credentials TO service_role;

-- 3) user_roles: impedir linhas sem conta vinculada (default não sobrescrevível por NULL)
ALTER TABLE public.user_roles ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();
ALTER TABLE public.user_roles ALTER COLUMN account_owner_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.user_roles_force_account_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.account_owner_id IS NULL THEN
    NEW.account_owner_id := COALESCE(public.get_user_account_owner_id(NEW.user_id), public.current_account_owner_id());
  END IF;
  IF NEW.account_owner_id IS NULL THEN
    RAISE EXCEPTION 'account_owner_id obrigatório em user_roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_force_account_owner ON public.user_roles;
CREATE TRIGGER trg_user_roles_force_account_owner
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_force_account_owner();