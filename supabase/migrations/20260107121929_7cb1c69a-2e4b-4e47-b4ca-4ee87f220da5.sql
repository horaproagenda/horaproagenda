-- Add payment_type field to service_packages for per-session vs full payment
ALTER TABLE public.service_packages 
ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'full' CHECK (payment_type IN ('full', 'per_session'));

-- Add payment_type field to package_templates
ALTER TABLE public.package_templates 
ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'full' CHECK (payment_type IN ('full', 'per_session'));

COMMENT ON COLUMN public.service_packages.payment_type IS 'full = valor total pago de uma vez, per_session = valor dividido por sessão';