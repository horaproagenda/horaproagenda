ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS quiet_hours_start integer,
  ADD COLUMN IF NOT EXISTS quiet_hours_end integer;

COMMENT ON COLUMN public.whatsapp_templates.quiet_hours_start IS 'Hora (0-23) a partir da qual mensagens podem ser enviadas';
COMMENT ON COLUMN public.whatsapp_templates.quiet_hours_end IS 'Hora (0-23) limite para envio de mensagens';