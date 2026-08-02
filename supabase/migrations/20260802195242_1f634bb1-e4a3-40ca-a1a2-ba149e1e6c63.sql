
-- =========================================================
-- 1) realtime_topic_suffix_uuid: strict UUID suffix parsing
-- =========================================================
CREATE OR REPLACE FUNCTION public.realtime_topic_suffix_uuid(_topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  m text[];
BEGIN
  IF _topic IS NULL THEN
    RETURN NULL;
  END IF;
  m := regexp_match(
         _topic,
         '^.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$',
         'i'
       );
  IF m IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN m[1]::uuid;
END;
$function$;

REVOKE ALL ON FUNCTION public.realtime_topic_suffix_uuid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.realtime_topic_suffix_uuid(text) TO authenticated, service_role;

-- =========================================================
-- 2) professional_credentials.temp_password: self-healing grants
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_temp_password_column_privileges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_priv text;
BEGIN
  -- Only issue REVOKEs when a grant actually exists, so the routine takes no
  -- lock on the table in the (normal) already-protected case.
  FOR v_priv IN
    SELECT DISTINCT privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'professional_credentials'
      AND column_name = 'temp_password'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('SELECT', 'UPDATE', 'INSERT')
  LOOP
    EXECUTE format(
      'REVOKE %s (temp_password) ON public.professional_credentials FROM anon, authenticated',
      v_priv
    );
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_temp_password_column_privileges() FROM PUBLIC;

-- Read-only self-check: true when no client role can read/write temp_password.
CREATE OR REPLACE FUNCTION public.security_check_temp_password_protected()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'professional_credentials'
      AND column_name = 'temp_password'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('SELECT', 'UPDATE', 'INSERT')
  );
$function$;

REVOKE ALL ON FUNCTION public.security_check_temp_password_protected() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_check_temp_password_protected() TO service_role;

-- Event trigger: after ANY DDL, re-revoke the column grants so a future migration
-- (e.g. a blanket "GRANT SELECT ON ALL TABLES") cannot silently re-expose the column.
CREATE OR REPLACE FUNCTION public.tg_enforce_sensitive_column_privileges()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Avoid recursing into ourselves via the REVOKE statements we may emit.
  IF current_setting('app.enforcing_column_privs', true) = 'on' THEN
    RETURN;
  END IF;
  PERFORM set_config('app.enforcing_column_privs', 'on', true);
  PERFORM public.enforce_temp_password_column_privileges();
  PERFORM set_config('app.enforcing_column_privs', 'off', true);
EXCEPTION WHEN OTHERS THEN
  -- never block DDL because of the hardening pass
  NULL;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS enforce_sensitive_column_privileges;
CREATE EVENT TRIGGER enforce_sensitive_column_privileges
  ON ddl_command_end
  EXECUTE FUNCTION public.tg_enforce_sensitive_column_privileges();

-- =========================================================
-- 3) user_roles: hard block privilege escalation at DB level
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_user_roles_block_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Trusted server-side paths (service_role / SQL editor) have no auth.uid().
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.role IN ('admin'::public.app_role, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado: concessão de papel privilegiado não permitida';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role IN ('admin'::public.app_role, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado: alteração de papel privilegiado não permitida';
  END IF;

  IF NEW.user_id = v_uid THEN
    RAISE EXCEPTION 'Acesso negado: autoatribuição de papel não permitida';
  END IF;

  IF NEW.account_owner_id IS NULL
     OR NEW.account_owner_id IS DISTINCT FROM public.current_account_owner_id() THEN
    RAISE EXCEPTION 'Acesso negado: papel fora do escopo da conta';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.account_owner_id IS DISTINCT FROM public.current_account_owner_id() THEN
    RAISE EXCEPTION 'Acesso negado: papel fora do escopo da conta';
  END IF;

  IF NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores gerenciam papéis';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_roles_block_escalation ON public.user_roles;
CREATE TRIGGER user_roles_block_escalation
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_block_escalation();

-- has_role: deny rows with an unresolvable tenant so a NULL account_owner_id row
-- can never satisfy a tenant-scoped role check.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.account_owner_id IS NOT NULL
      AND (
        ur.role = 'super_admin'::app_role
        OR ur.account_owner_id = public.current_account_owner_id()
      )
  );
$function$;
