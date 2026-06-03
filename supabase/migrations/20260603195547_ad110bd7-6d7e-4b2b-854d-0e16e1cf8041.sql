
DROP POLICY IF EXISTS "Professionals can update own row safe fields" ON public.professionals;
CREATE POLICY "Professionals can update own row safe fields"
  ON public.professionals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
