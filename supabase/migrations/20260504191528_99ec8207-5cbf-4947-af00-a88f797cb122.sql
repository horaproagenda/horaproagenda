
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS reminder_hours_before integer[] NOT NULL DEFAULT ARRAY[24,1],
  ADD COLUMN IF NOT EXISTS reminder_provider text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS twilio_from_number text;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_reminder_provider_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_reminder_provider_check
  CHECK (reminder_provider IN ('whatsapp','twilio_sms','twilio_whatsapp'));

CREATE TABLE IF NOT EXISTS public.appointment_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  hours_before integer NOT NULL,
  provider text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, hours_before, provider)
);

ALTER TABLE public.appointment_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage reminder log" ON public.appointment_reminder_log;
CREATE POLICY "Admins manage reminder log" ON public.appointment_reminder_log
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated read reminder log" ON public.appointment_reminder_log;
CREATE POLICY "Authenticated read reminder log" ON public.appointment_reminder_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_appointment_reminder_log_apt ON public.appointment_reminder_log(appointment_id);
