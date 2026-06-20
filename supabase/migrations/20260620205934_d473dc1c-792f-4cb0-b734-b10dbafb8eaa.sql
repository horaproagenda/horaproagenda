
-- Restrict twilio_message_events reads to super_admin only (infrastructure log, not tenant data)
DROP POLICY IF EXISTS "Admins can view twilio message events" ON public.twilio_message_events;
CREATE POLICY "Super admins can view twilio message events"
  ON public.twilio_message_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Restrict app_version_events reads/deletes to super_admin only
DROP POLICY IF EXISTS "Only admins can view version events" ON public.app_version_events;
CREATE POLICY "Super admins can view version events"
  ON public.app_version_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Only admins can delete version events" ON public.app_version_events;
CREATE POLICY "Super admins can delete version events"
  ON public.app_version_events
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));
