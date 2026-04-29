-- Recriar funções de RBAC garantindo permissão de execução para usuários autenticados
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_professional_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.professionals
  WHERE user_id = _user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_professional_id_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_professional_id_for_user(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_service_package(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_package_appointment(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_client_record(uuid) TO authenticated, anon;