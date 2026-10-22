ALTER TABLE public.package_template_steps
  ADD COLUMN IF NOT EXISTS commission_type text CHECK (commission_type IN ('percentage','fixed')),
  ADD COLUMN IF NOT EXISTS commission_value numeric CHECK (commission_value IS NULL OR commission_value >= 0);