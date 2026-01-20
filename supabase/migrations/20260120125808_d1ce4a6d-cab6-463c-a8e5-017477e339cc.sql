-- Add equipment column to services table
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS equipment text[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.services.equipment IS 'Array of equipment IDs associated with this service';