CREATE OR REPLACE FUNCTION public.assert_not_super_admin_reading_tenant()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  -- Super admin que também é membro de uma conta pode ler os dados da PRÓPRIA conta;
  -- o isolamento por conta (account_owner_id = current_account_owner_id()) continua valendo nas demais políticas.
  SELECT NOT public.is_super_admin(auth.uid()) OR public.current_account_owner_id() IS NOT NULL
$$;