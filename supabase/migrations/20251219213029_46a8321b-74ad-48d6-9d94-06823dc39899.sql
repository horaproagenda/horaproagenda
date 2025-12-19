-- Add package_appointment_id to appointments table to link appointments to package sessions
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS package_appointment_id uuid REFERENCES public.package_appointments(id) ON DELETE SET NULL;