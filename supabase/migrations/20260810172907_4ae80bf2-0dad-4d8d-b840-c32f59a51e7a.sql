-- 1) appointment_product_consumption: remove misaligned defaults
ALTER TABLE public.appointment_product_consumption
  ALTER COLUMN appointment_id DROP DEFAULT,
  ALTER COLUMN product_id DROP DEFAULT;

-- 2) professional_credentials: no direct read of plaintext temp_password
REVOKE SELECT (temp_password), INSERT (temp_password), UPDATE (temp_password)
  ON public.professional_credentials FROM anon, authenticated;

DROP POLICY IF EXISTS tenant_read_professional_credentials ON public.professional_credentials;
CREATE POLICY tenant_read_professional_credentials
  ON public.professional_credentials
  FOR SELECT
  TO authenticated
  USING (
    account_owner_id = public.current_account_owner_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Only the security-definer accessor may reveal the temp password, scoped to the
-- caller's own account and limited to a 24h window; expired values are purged.
CREATE OR REPLACE FUNCTION public.get_professional_temp_password(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pwd text;
  v_owner uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_owner := public.current_account_owner_id();
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- purge expired temp passwords for this account
  UPDATE public.professional_credentials
  SET temp_password = NULL
  WHERE account_owner_id = v_owner
    AND temp_password IS NOT NULL
    AND set_at < now() - interval '24 hours';

  SELECT temp_password INTO v_pwd
  FROM public.professional_credentials
  WHERE user_id = _user_id
    AND account_owner_id = v_owner
    AND must_change_password = true
    AND set_at > now() - interval '24 hours'
  LIMIT 1;

  PERFORM public.log_access('professional_credentials', 'view', 'professional_credential', _user_id,
    ARRAY['temp_password'], '{}'::text[], '{}'::jsonb);

  RETURN v_pwd;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_old_temp_passwords()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.professional_credentials
  SET temp_password = NULL
  WHERE temp_password IS NOT NULL
    AND set_at IS NOT NULL
    AND set_at < now() - INTERVAL '24 hours';
$function$;

SELECT public.expire_old_temp_passwords();
SELECT public.enforce_temp_password_column_privileges();