DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND p.prorettype='trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.fn);
  END LOOP;
END $$;