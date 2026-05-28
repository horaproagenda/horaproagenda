
DROP POLICY IF EXISTS "Admins and receptionists can manage appointment additional item" ON public.appointment_additional_items;
DROP POLICY IF EXISTS "Professionals can create own appointment additional items" ON public.appointment_additional_items;
DROP POLICY IF EXISTS "Professionals can delete own appointment additional items" ON public.appointment_additional_items;
DROP POLICY IF EXISTS "Professionals can update own appointment additional items" ON public.appointment_additional_items;
DROP POLICY IF EXISTS "Professionals can view own appointment additional items" ON public.appointment_additional_items;

CREATE POLICY "Admins and receptionists can manage appointment additional item"
ON public.appointment_additional_items
AS PERMISSIVE FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Professionals can view own appointment additional items"
ON public.appointment_additional_items
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.appointments a
  WHERE a.id = appointment_additional_items.appointment_id
    AND a.professional_id = get_professional_id_for_user(auth.uid())
));

CREATE POLICY "Professionals can create own appointment additional items"
ON public.appointment_additional_items
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.appointments a
  WHERE a.id = appointment_additional_items.appointment_id
    AND a.professional_id = get_professional_id_for_user(auth.uid())
));

CREATE POLICY "Professionals can update own appointment additional items"
ON public.appointment_additional_items
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.appointments a
  WHERE a.id = appointment_additional_items.appointment_id
    AND a.professional_id = get_professional_id_for_user(auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.appointments a
  WHERE a.id = appointment_additional_items.appointment_id
    AND a.professional_id = get_professional_id_for_user(auth.uid())
));

CREATE POLICY "Professionals can delete own appointment additional items"
ON public.appointment_additional_items
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.appointments a
  WHERE a.id = appointment_additional_items.appointment_id
    AND a.professional_id = get_professional_id_for_user(auth.uid())
));
