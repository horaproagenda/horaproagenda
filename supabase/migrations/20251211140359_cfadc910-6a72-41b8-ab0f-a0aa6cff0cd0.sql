-- Add user_id column to professionals table to link with auth.users
ALTER TABLE public.professionals 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_professionals_user_id ON public.professionals(user_id);

-- Create a helper function to get professional_id from authenticated user
CREATE OR REPLACE FUNCTION public.get_professional_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.professionals WHERE user_id = _user_id LIMIT 1
$$;

-- Drop existing appointment SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON public.appointments;

-- Create new policy: Admins see all, professionals see only their appointments
CREATE POLICY "Users can view relevant appointments" 
ON public.appointments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  professional_id = get_professional_id_for_user(auth.uid()) OR
  professional_id IS NULL
);

-- Drop existing appointment UPDATE policy
DROP POLICY IF EXISTS "Authenticated users can update appointments" ON public.appointments;

-- Create new policy: Admins can update all, professionals can update their own
CREATE POLICY "Users can update relevant appointments" 
ON public.appointments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  professional_id = get_professional_id_for_user(auth.uid()) OR
  professional_id IS NULL
);