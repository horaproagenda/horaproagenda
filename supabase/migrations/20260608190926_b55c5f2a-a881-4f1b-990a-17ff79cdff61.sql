
-- 1) verificacoes_whatsapp: remove permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can request whatsapp verification" ON public.verificacoes_whatsapp;
REVOKE INSERT ON public.verificacoes_whatsapp FROM anon, authenticated;

-- 2) package_templates: allow professionals to see shared (NULL professional_id) templates
DROP POLICY IF EXISTS "Users can view package templates based on role" ON public.package_templates;
CREATE POLICY "Users can view package templates based on role"
ON public.package_templates
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'receptionist'::app_role)
  OR professional_id IS NULL
  OR professional_id = public.get_professional_id_for_user(auth.uid())
);

-- 3) profiles: allow admins and super_admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);
