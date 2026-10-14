-- Rollback: drop guard_product_inventory_integrity trigger/function; restore preceding purchase guards if required.
CREATE OR REPLACE FUNCTION public.guard_product_inventory_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
 IF EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.product_daily_consumption WHERE product_id=OLD.id) THEN RAISE EXCEPTION 'Este produto possui histórico. Desative o cadastro para preservar os registros.'; END IF;
 RETURN OLD; END IF;
 IF NEW.current_stock IS NULL OR NEW.current_stock<0 OR NEW.current_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um estoque válido.'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=NEW.id AND status IN ('planned','in_use') AND stock_quantity>NEW.current_stock) THEN RAISE EXCEPTION 'O estoque não pode ficar abaixo da quantidade planejada ou em uso.'; END IF;
 IF NEW.unit IS DISTINCT FROM OLD.unit AND (EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.product_daily_consumption WHERE product_id=OLD.id)) THEN RAISE EXCEPTION 'Não altere a unidade de um produto com histórico. Cadastre outro produto para a nova unidade.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER product_inventory_integrity BEFORE UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_product_inventory_integrity();
REVOKE ALL ON FUNCTION public.guard_product_inventory_integrity() FROM PUBLIC,anon,authenticated;
-- Audit history is append-only for ordinary API callers. Server lifecycle RPCs own writes.
REVOKE INSERT,UPDATE,DELETE ON public.product_usage_events FROM anon,authenticated;
GRANT SELECT ON public.product_usage_events TO authenticated;
GRANT ALL ON public.product_usage_events TO service_role;
