-- Add updated_by column to clients table for audit trail
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- Add updated_by to other main tables
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.service_packages ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);