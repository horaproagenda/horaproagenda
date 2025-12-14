-- Update clients RLS: professionals can ONLY see clients assigned to them (not unassigned ones)
DROP POLICY IF EXISTS "Users can view clients based on role" ON public.clients;
CREATE POLICY "Users can view clients based on role" ON public.clients
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  (assigned_professional_id = get_professional_id_for_user(auth.uid()))
);

DROP POLICY IF EXISTS "Users can update clients based on role" ON public.clients;
CREATE POLICY "Users can update clients based on role" ON public.clients
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  (assigned_professional_id = get_professional_id_for_user(auth.uid()))
);

DROP POLICY IF EXISTS "Users can insert clients" ON public.clients;
CREATE POLICY "Users can insert clients" ON public.clients
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  (assigned_professional_id = get_professional_id_for_user(auth.uid()))
);

-- Update appointments RLS: professionals can only see appointments for their assigned clients
DROP POLICY IF EXISTS "Users can view relevant appointments" ON public.appointments;
CREATE POLICY "Users can view relevant appointments" ON public.appointments
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  (professional_id = get_professional_id_for_user(auth.uid())) OR
  (EXISTS (
    SELECT 1 FROM clients c 
    WHERE c.id = appointments.client_id 
    AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
  ))
);

DROP POLICY IF EXISTS "Users can update relevant appointments" ON public.appointments;
CREATE POLICY "Users can update relevant appointments" ON public.appointments
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'receptionist'::app_role) OR 
  (professional_id = get_professional_id_for_user(auth.uid())) OR
  (EXISTS (
    SELECT 1 FROM clients c 
    WHERE c.id = appointments.client_id 
    AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
  ))
);