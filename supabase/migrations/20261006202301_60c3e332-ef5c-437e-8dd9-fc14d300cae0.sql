ALTER FUNCTION private.get_user_tenant() SET search_path = '';
ALTER FUNCTION private.is_user_in_org(uuid) SET search_path = '';
DO $$ BEGIN
  BEGIN EXECUTE 'ALTER FUNCTION graphql.increment_schema_version() SET search_path = ''''';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'graphql.increment_schema_version: %', SQLERRM; END;
  BEGIN EXECUTE 'ALTER FUNCTION graphql.get_schema_version() SET search_path = ''''';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'graphql.get_schema_version: %', SQLERRM; END;
END $$;
DROP POLICY IF EXISTS "pricing_cache_public_read" ON public.pricing_cache;