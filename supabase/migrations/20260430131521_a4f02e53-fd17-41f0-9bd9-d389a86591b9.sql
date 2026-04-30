ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS clinic_name text,
ADD COLUMN IF NOT EXISTS clinic_cnpj text,
ADD COLUMN IF NOT EXISTS clinic_phone text,
ADD COLUMN IF NOT EXISTS clinic_address text;