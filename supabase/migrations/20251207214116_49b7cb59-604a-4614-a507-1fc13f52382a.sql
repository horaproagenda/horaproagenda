-- Add return_days column to services table
ALTER TABLE public.services 
ADD COLUMN return_days integer DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.services.return_days IS 'Number of days until client should return for this service';