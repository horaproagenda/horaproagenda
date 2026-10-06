-- 1) Visitantes sem login: sem acesso direto às tabelas (exceto as públicas de fato)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','v','m','f')
             AND c.relname NOT IN ('interest_leads','pricing_cache')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;
REVOKE ALL ON public.interest_leads FROM anon;
GRANT INSERT ON public.interest_leads TO anon;
REVOKE ALL ON public.pricing_cache FROM anon;
GRANT SELECT ON public.pricing_cache TO anon;
REVOKE ALL ON public.contact_change_verifications FROM authenticated;

-- 2) Funções privilegiadas: só para usuários logados (e servidor), exceto as dos links públicos
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prosecdef
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN (
             'get_client_registration_link_by_token','confirm_appointment_by_token',
             'authenticate_document_fill_link','get_document_fill_link_by_token',
             'submit_document_fill_by_token')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
  END LOOP;
END $$;

-- 3) Novas funções privilegiadas não ficam abertas a visitantes por padrão
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;