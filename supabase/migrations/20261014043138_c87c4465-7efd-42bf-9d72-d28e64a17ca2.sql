CREATE OR REPLACE FUNCTION public.guard_product_inventory_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
 IF EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.product_daily_consumption WHERE product_id=OLD.id) THEN RAISE EXCEPTION 'Este produto possui histórico. Desative o cadastro para preservar os registros.'; END IF;
 RETURN OLD; END IF;
 IF NEW.current_stock IS NULL OR NEW.current_stock<0 OR NEW.current_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Informe um estoque válido.'; END IF;
 IF NEW.unit IS DISTINCT FROM OLD.unit AND (EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=OLD.id) OR EXISTS(SELECT 1 FROM public.product_daily_consumption WHERE product_id=OLD.id)) THEN RAISE EXCEPTION 'Não altere a unidade de um produto com histórico. Cadastre outro produto para a nova unidade.'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_purchase_reserved_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE delta numeric; available numeric;
BEGIN
 delta:=CASE WHEN TG_OP='DELETE' THEN -OLD.quantity ELSE NEW.quantity-OLD.quantity END;
 IF delta<0 THEN
 SELECT current_stock+delta INTO available FROM public.products WHERE id=OLD.product_id FOR UPDATE;
 IF available<0 OR EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=OLD.product_id AND status IN ('planned','in_use') AND stock_quantity>available) THEN RAISE EXCEPTION 'Esta compra mantém estoque já usado, planejado ou em uso. Confira o ciclo antes de reduzir a compra.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER purchase_reserved_stock BEFORE UPDATE OF quantity OR DELETE ON public.product_purchases FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_reserved_stock();
REVOKE ALL ON FUNCTION public.guard_purchase_reserved_stock() FROM PUBLIC,anon,authenticated;
