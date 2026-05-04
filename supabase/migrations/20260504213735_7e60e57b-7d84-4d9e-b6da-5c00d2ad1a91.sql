
-- 1. Remove self-write policies on professionals (privilege escalation risk)
DROP POLICY IF EXISTS professionals_insert_own ON public.professionals;
DROP POLICY IF EXISTS professionals_update_own ON public.professionals;
DROP POLICY IF EXISTS professionals_delete_own ON public.professionals;
DROP POLICY IF EXISTS professionals_select_own ON public.professionals;

-- Allow professional to view ONLY their own record (read-only)
CREATE POLICY "Professionals can view own record"
  ON public.professionals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Add per-professional WhatsApp from-number
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS whatsapp_from_number text;

COMMENT ON COLUMN public.professionals.whatsapp_from_number IS 'Número WhatsApp remetente exclusivo deste profissional (ex: whatsapp:+5511...). Quando vazio, usa o padrão de Configurações.';

-- 3. Require professional on service_packages going forward (validation trigger; legacy rows preserved)
CREATE OR REPLACE FUNCTION public.validate_service_package_professional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.professional_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório atribuir um profissional responsável ao pacote.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_packages_require_professional ON public.service_packages;
CREATE TRIGGER trg_service_packages_require_professional
  BEFORE INSERT OR UPDATE OF professional_id ON public.service_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_service_package_professional();

-- 4. Same for package_templates
CREATE OR REPLACE FUNCTION public.validate_package_template_professional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.professional_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório atribuir um profissional responsável ao modelo de pacote.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_package_templates_require_professional ON public.package_templates;
CREATE TRIGGER trg_package_templates_require_professional
  BEFORE INSERT OR UPDATE OF professional_id ON public.package_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_package_template_professional();
