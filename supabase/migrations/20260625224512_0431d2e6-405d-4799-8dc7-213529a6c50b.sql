DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'professional_whatsapp_credentials'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_whatsapp_credentials;
  END IF;
END $$;
ALTER TABLE public.professional_whatsapp_credentials REPLICA IDENTITY FULL;