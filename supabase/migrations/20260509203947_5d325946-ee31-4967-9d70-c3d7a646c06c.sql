CREATE TABLE public.twilio_message_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_sid TEXT NOT NULL,
  message_status TEXT,
  error_code TEXT,
  error_message TEXT,
  to_number TEXT,
  from_number TEXT,
  account_sid TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_twilio_events_sid ON public.twilio_message_events(message_sid);
CREATE INDEX idx_twilio_events_created_at ON public.twilio_message_events(created_at DESC);
CREATE INDEX idx_twilio_events_status ON public.twilio_message_events(message_status);

ALTER TABLE public.twilio_message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view twilio message events"
  ON public.twilio_message_events
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));