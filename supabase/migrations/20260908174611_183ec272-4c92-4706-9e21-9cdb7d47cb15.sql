ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS allowed_room_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS allowed_equipment_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

DROP POLICY IF EXISTS "Professionals can insert own absences" ON public.professional_absences;
CREATE POLICY "Professionals can insert own absences"
ON public.professional_absences
FOR INSERT
TO authenticated
WITH CHECK (
  professional_id = public.get_professional_id_for_user(auth.uid())
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can update own absences" ON public.professional_absences;
CREATE POLICY "Professionals can update own absences"
ON public.professional_absences
FOR UPDATE
TO authenticated
USING (professional_id = public.get_professional_id_for_user(auth.uid()))
WITH CHECK (professional_id = public.get_professional_id_for_user(auth.uid()));

DROP POLICY IF EXISTS "Professionals can delete own absences" ON public.professional_absences;
CREATE POLICY "Professionals can delete own absences"
ON public.professional_absences
FOR DELETE
TO authenticated
USING (professional_id = public.get_professional_id_for_user(auth.uid()));