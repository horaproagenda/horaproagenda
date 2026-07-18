
CREATE OR REPLACE FUNCTION public.claim_ultramsg_pool_instance(p_professional_id uuid)
RETURNS TABLE(id uuid, instance_id text, token text, api_url text, activated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $function$
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
           THEN extensions.pgp_sym_decrypt(v_row.token_encrypted, k)
           ELSE v_row.token END,
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
         THEN extensions.pgp_sym_decrypt(v_row.token_encrypted, k)
         ELSE v_row.token END,
    v_row.api_url, v_row.activated_at;
END;
$function$;
