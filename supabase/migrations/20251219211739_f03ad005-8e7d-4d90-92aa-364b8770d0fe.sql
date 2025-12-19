-- Drop the incorrect foreign key constraint pointing to auth.users
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;

-- Add the correct foreign key constraint pointing to public.professionals
ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_professional_id_fkey 
FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;