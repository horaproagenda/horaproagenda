-- Update RLS policies for services table to filter by professional
-- Professionals can only see services assigned to them

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;

-- Create new SELECT policy that allows:
-- 1. Admins and receptionists to see all services
-- 2. Professionals to see only their own services (where professional_id matches their ID)
-- 3. Services without a professional assigned can be seen by all
CREATE POLICY "Users can view services based on role"
ON public.services
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR
  professional_id IS NULL OR
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Update INSERT policy to allow professionals to create their own services
DROP POLICY IF EXISTS "Admins can insert services" ON public.services;

CREATE POLICY "Users can insert services based on role"
ON public.services
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Update UPDATE policy to allow professionals to update their own services
DROP POLICY IF EXISTS "Admins can update services" ON public.services;

CREATE POLICY "Users can update services based on role"
ON public.services
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Update DELETE policy to allow professionals to delete their own services
DROP POLICY IF EXISTS "Admins can delete services" ON public.services;

CREATE POLICY "Users can delete services based on role"
ON public.services
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Update RLS policies for service_packages table to filter by professional
-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view service packages" ON public.service_packages;
DROP POLICY IF EXISTS "Admins can insert service packages" ON public.service_packages;
DROP POLICY IF EXISTS "Admins can update service packages" ON public.service_packages;
DROP POLICY IF EXISTS "Admins can delete service packages" ON public.service_packages;

-- Create new SELECT policy
CREATE POLICY "Users can view service packages based on role"
ON public.service_packages
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR
  professional_id IS NULL OR
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Create new INSERT policy
CREATE POLICY "Users can insert service packages based on role"
ON public.service_packages
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Create new UPDATE policy
CREATE POLICY "Users can update service packages based on role"
ON public.service_packages
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR
  professional_id = get_professional_id_for_user(auth.uid())
);

-- Create new DELETE policy
CREATE POLICY "Users can delete service packages based on role"
ON public.service_packages
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  professional_id = get_professional_id_for_user(auth.uid())
);