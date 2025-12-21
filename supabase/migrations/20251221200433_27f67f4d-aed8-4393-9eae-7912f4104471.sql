-- Enable realtime for appointments table
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

-- Enable realtime for single_sales table  
ALTER TABLE public.single_sales REPLICA IDENTITY FULL;

-- Enable realtime for package_appointments table
ALTER TABLE public.package_appointments REPLICA IDENTITY FULL;

-- Add tables to realtime publication
DO $$ 
BEGIN
  -- Check and add appointments to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
  
  -- Check and add single_sales to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'single_sales'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.single_sales;
  END IF;
  
  -- Check and add package_appointments to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'package_appointments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.package_appointments;
  END IF;
END $$;