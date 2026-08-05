DROP POLICY IF EXISTS "Users manage own contact change verifications" ON public.contact_change_verifications;

REVOKE ALL ON public.contact_change_verifications FROM anon;
REVOKE ALL ON public.contact_change_verifications FROM authenticated;
GRANT ALL ON public.contact_change_verifications TO service_role;

ALTER TABLE public.contact_change_verifications ENABLE ROW LEVEL SECURITY;