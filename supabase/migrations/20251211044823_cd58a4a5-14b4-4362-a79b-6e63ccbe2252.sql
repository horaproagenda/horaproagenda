-- Add is_active and referral_source columns to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS referral_source text NULL;

-- Create index for is_active for better filtering performance
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON public.clients(is_active);