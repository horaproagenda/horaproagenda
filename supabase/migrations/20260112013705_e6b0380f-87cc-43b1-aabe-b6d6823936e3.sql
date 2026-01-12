-- Fix suppliers RLS: restrict access to admins and receptionists only
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;

CREATE POLICY "Admins and receptionists can view suppliers"
ON public.suppliers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'receptionist'::app_role)
);