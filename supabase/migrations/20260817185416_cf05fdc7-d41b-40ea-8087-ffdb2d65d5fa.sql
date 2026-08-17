-- Garante que todo profissional com usuário vinculado tenha o papel 'professional'
CREATE OR REPLACE FUNCTION public.tg_ensure_professional_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, account_owner_id)
    SELECT NEW.user_id, 'professional'::app_role,
           COALESCE(NEW.account_owner_id, NEW.user_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_professional_role ON public.professionals;
CREATE TRIGGER ensure_professional_role
AFTER INSERT OR UPDATE OF user_id ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.tg_ensure_professional_role();

-- Corrige profissionais existentes que ficaram sem papel algum
INSERT INTO public.user_roles (user_id, role, account_owner_id)
SELECT p.user_id, 'professional'::app_role, COALESCE(p.account_owner_id, p.user_id)
FROM public.professionals p
WHERE p.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id);