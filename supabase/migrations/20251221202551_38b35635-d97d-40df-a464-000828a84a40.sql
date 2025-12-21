-- Enable realtime for service_packages table
ALTER TABLE public.service_packages REPLICA IDENTITY FULL;

-- Add service_packages to realtime publication if not already added
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'service_packages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_packages;
  END IF;
END $$;