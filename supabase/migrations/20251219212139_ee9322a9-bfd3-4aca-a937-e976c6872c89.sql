-- Add service_id column to service_packages to link packages to a base service
ALTER TABLE public.service_packages 
ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;

-- Make service_id nullable in appointments table to allow package-only appointments
ALTER TABLE public.appointments 
ALTER COLUMN service_id DROP NOT NULL;