
-- 1) professional_absences: require authentication for SELECT
DROP POLICY IF EXISTS "Anyone can view absences" ON public.professional_absences;
DROP POLICY IF EXISTS "Public can view absences" ON public.professional_absences;
DROP POLICY IF EXISTS "Absences are viewable by everyone" ON public.professional_absences;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'professional_absences'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.professional_absences', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "Authenticated users can view professional absences"
ON public.professional_absences
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 2) messages: replace JWT-claim-based admin delete policy with has_role()
DROP POLICY IF EXISTS "admins_can_delete_messages" ON public.messages;

CREATE POLICY "admins_can_delete_messages"
ON public.messages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
