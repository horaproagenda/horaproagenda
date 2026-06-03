
-- Per-professional quiet hours (overrides template window when set)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS quiet_hours_start integer,
  ADD COLUMN IF NOT EXISTS quiet_hours_end integer;

COMMENT ON COLUMN public.professionals.quiet_hours_start IS 'Hora (0-23) inicial da janela de envio de mensagens WhatsApp para mensagens deste profissional';
COMMENT ON COLUMN public.professionals.quiet_hours_end IS 'Hora (0-23) final (exclusiva) da janela de envio de mensagens WhatsApp deste profissional';

-- Retry queue for WhatsApp messages that fail or fall outside the send window
CREATE TABLE IF NOT EXISTS public.whatsapp_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone text NOT NULL,
  body text NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  template_type text,
  hours_before numeric,
  provider text,
  dedup_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_send_queue TO authenticated;
GRANT ALL ON public.whatsapp_send_queue TO service_role;

ALTER TABLE public.whatsapp_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view whatsapp queue"
  ON public.whatsapp_send_queue
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_queue_pending
  ON public.whatsapp_send_queue (status, next_attempt_at);
