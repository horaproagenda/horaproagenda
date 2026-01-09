-- Add timezone field to business_settings
ALTER TABLE public.business_settings 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';

-- Add comment explaining the field
COMMENT ON COLUMN public.business_settings.timezone IS 'IANA timezone identifier for the business location (e.g., America/Sao_Paulo, America/Manaus)';