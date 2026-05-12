
-- 1) app_version_events: restrict INSERT to authenticated
DROP POLICY IF EXISTS "Anyone can insert version events" ON public.app_version_events;
CREATE POLICY "Authenticated users can insert version events"
  ON public.app_version_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2) audit_log: block direct inserts (only SECURITY DEFINER triggers may write)
DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON public.audit_log;
CREATE POLICY "Block direct audit_log inserts"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 3) verification_codes: explicitly block anon/authenticated writes (managed only via service role)
DROP POLICY IF EXISTS "Block all inserts on verification_codes" ON public.verification_codes;
CREATE POLICY "Block all inserts on verification_codes"
  ON public.verification_codes
  FOR INSERT
  TO public
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block all updates on verification_codes" ON public.verification_codes;
CREATE POLICY "Block all updates on verification_codes"
  ON public.verification_codes
  FOR UPDATE
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block all deletes on verification_codes" ON public.verification_codes;
CREATE POLICY "Block all deletes on verification_codes"
  ON public.verification_codes
  FOR DELETE
  TO public
  USING (false);
