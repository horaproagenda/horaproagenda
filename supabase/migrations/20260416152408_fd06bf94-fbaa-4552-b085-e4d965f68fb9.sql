-- Fix 1: Goals table - replace public ALL policy with authenticated-only policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.goals;

CREATE POLICY "Authenticated can view goals"
  ON public.goals FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert goals"
  ON public.goals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update goals"
  ON public.goals FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can delete goals"
  ON public.goals FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Fix 2: Trial registrations - drop overly permissive public policy
DROP POLICY IF EXISTS "Service role can manage trial registrations" ON public.trial_registrations;

-- Fix 3: Client photos storage - remove overly broad policies
DROP POLICY IF EXISTS "Authenticated users can update client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload client photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete client photos" ON storage.objects;