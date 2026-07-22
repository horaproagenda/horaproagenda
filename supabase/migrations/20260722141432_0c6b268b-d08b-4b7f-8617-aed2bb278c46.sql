
-- 1) Revoke direct column access on temp_password; force access via RPC only
REVOKE SELECT (temp_password) ON public.professional_credentials FROM authenticated;
REVOKE SELECT (temp_password) ON public.professional_credentials FROM anon;

-- Ensure explicit column grants exist for all non-sensitive columns so SELECT still works
DO $$
DECLARE
  col text;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='professional_credentials'
      AND column_name <> 'temp_password'
  LOOP
    EXECUTE format('GRANT SELECT (%I) ON public.professional_credentials TO authenticated', col);
  END LOOP;
END $$;

-- 2) Defense-in-depth for interest_leads: ensure no anon SELECT exists (there is none), keep INSERT scoped.
-- Explicitly deny SELECT for anon (no-op if no policy exists, but revokes any latent table-level grant).
REVOKE SELECT ON public.interest_leads FROM anon;
