ALTER TABLE public.products ADD COLUMN IF NOT EXISTS usage_scope text NOT NULL DEFAULT 'appointments';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expected_duration_days integer;

CREATE OR REPLACE FUNCTION public.validate_product_usage_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.usage_scope NOT IN ('appointments','general') THEN
    RAISE EXCEPTION 'Tipo de uso do produto inválido.';
  END IF;
  IF NEW.expected_duration_days IS NOT NULL AND (NEW.expected_duration_days < 1 OR NEW.expected_duration_days > 3650) THEN
    RAISE EXCEPTION 'A duração média deve ficar entre 1 e 3650 dias.';
  END IF;
  IF NEW.usage_scope = 'general' AND (TG_OP = 'INSERT' OR OLD.usage_scope IS DISTINCT FROM 'general') AND TG_OP = 'UPDATE' THEN
    IF EXISTS (SELECT 1 FROM public.service_products WHERE product_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.package_template_products WHERE product_id = NEW.id) THEN
      RAISE EXCEPTION 'Remova os vínculos com serviços e pacotes antes de marcar o produto como uso geral.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_product_usage_scope ON public.products;
CREATE TRIGGER trg_validate_product_usage_scope BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_product_usage_scope();

CREATE OR REPLACE FUNCTION public.reject_general_product_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products WHERE id = NEW.product_id AND usage_scope = 'general') THEN
    RAISE EXCEPTION 'Este produto é de uso geral e não pode ser vinculado a serviços ou pacotes.';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.reject_general_product_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_reject_general_product_link ON public.service_products;
CREATE TRIGGER trg_reject_general_product_link BEFORE INSERT OR UPDATE OF product_id ON public.service_products
FOR EACH ROW EXECUTE FUNCTION public.reject_general_product_link();
DROP TRIGGER IF EXISTS trg_reject_general_product_link ON public.package_template_products;
CREATE TRIGGER trg_reject_general_product_link BEFORE INSERT OR UPDATE OF product_id ON public.package_template_products
FOR EACH ROW EXECUTE FUNCTION public.reject_general_product_link();