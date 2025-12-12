-- Add column to track which professional created/manages each client
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS assigned_professional_id uuid REFERENCES public.professionals(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_clients_assigned_professional ON public.clients(assigned_professional_id);

-- Drop existing RLS policies for clients
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Admins can delete clients" ON public.clients;

-- Create new RLS policies that filter by professional
-- Admins can see all clients, professionals only see their assigned clients
CREATE POLICY "Users can view clients based on role" 
ON public.clients 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR assigned_professional_id = get_professional_id_for_user(auth.uid())
  OR assigned_professional_id IS NULL
);

-- Admins and receptionists can insert, professionals can insert with their ID
CREATE POLICY "Users can insert clients" 
ON public.clients 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR (assigned_professional_id = get_professional_id_for_user(auth.uid()))
  OR assigned_professional_id IS NULL
);

-- Users can update their assigned clients or admins can update all
CREATE POLICY "Users can update clients based on role" 
ON public.clients 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR assigned_professional_id = get_professional_id_for_user(auth.uid())
  OR assigned_professional_id IS NULL
);

-- Only admins can delete
CREATE POLICY "Admins can delete clients" 
ON public.clients 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Update appointments policies to filter by professional
DROP POLICY IF EXISTS "Users can view relevant appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can update relevant appointments" ON public.appointments;

-- Appointments: admins see all, professionals see theirs
CREATE POLICY "Users can view relevant appointments" 
ON public.appointments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR professional_id = get_professional_id_for_user(auth.uid())
  OR professional_id IS NULL
);

CREATE POLICY "Users can update relevant appointments" 
ON public.appointments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR professional_id = get_professional_id_for_user(auth.uid())
  OR professional_id IS NULL
);

-- Update client_documents policies
DROP POLICY IF EXISTS "Authenticated users can view client documents" ON public.client_documents;
DROP POLICY IF EXISTS "Authenticated users can update client documents" ON public.client_documents;

CREATE POLICY "Users can view client documents based on role" 
ON public.client_documents 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id 
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) 
         OR c.assigned_professional_id IS NULL)
  )
);

CREATE POLICY "Users can update client documents based on role" 
ON public.client_documents 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id 
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) 
         OR c.assigned_professional_id IS NULL)
  )
);

-- Update treatment_photos policies
DROP POLICY IF EXISTS "Authenticated users can view treatment photos" ON public.treatment_photos;
DROP POLICY IF EXISTS "Authenticated users can update treatment photos" ON public.treatment_photos;

CREATE POLICY "Users can view treatment photos based on role" 
ON public.treatment_photos 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id 
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) 
         OR c.assigned_professional_id IS NULL)
  )
);

CREATE POLICY "Users can update treatment photos based on role" 
ON public.treatment_photos 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id 
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) 
         OR c.assigned_professional_id IS NULL)
  )
);

-- Update quotes policies
DROP POLICY IF EXISTS "Authenticated users can view quotes" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated users can update quotes" ON public.quotes;

CREATE POLICY "Users can view quotes based on role" 
ON public.quotes 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id 
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) 
         OR c.assigned_professional_id IS NULL)
  )
);

CREATE POLICY "Users can update quotes based on role" 
ON public.quotes 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id 
    AND (c.assigned_professional_id = get_professional_id_for_user(auth.uid()) 
         OR c.assigned_professional_id IS NULL)
  )
);