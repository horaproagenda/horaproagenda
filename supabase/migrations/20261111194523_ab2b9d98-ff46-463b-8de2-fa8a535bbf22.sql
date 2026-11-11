CREATE OR REPLACE FUNCTION public.guard_purchase_reserved_stock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE delta numeric; available numeric;
BEGIN
 IF TG_OP='DELETE' AND current_setting('app.deleting_product_id', true) = OLD.product_id::text THEN RETURN OLD; END IF;
 delta:=CASE WHEN TG_OP='DELETE' THEN -OLD.quantity ELSE NEW.quantity-OLD.quantity END;
 IF delta<0 THEN
 SELECT current_stock+delta INTO available FROM public.products WHERE id=OLD.product_id FOR UPDATE;
 IF available<0 OR EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=OLD.product_id AND status IN ('planned','in_use') AND stock_quantity>available) THEN RAISE EXCEPTION 'Esta compra mantém estoque já usado, planejado ou em uso. Confira o ciclo antes de reduzir a compra.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.delete_product_safe(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_has_history boolean; v_count int;
BEGIN
 PERFORM 1 FROM public.products WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado ou sem permissão para excluir.' USING ERRCODE='42501'; END IF;
 v_has_history := EXISTS(SELECT 1 FROM public.product_usage_records WHERE product_id=p_id)
   OR EXISTS(SELECT 1 FROM public.product_daily_consumption WHERE product_id=p_id)
   OR EXISTS(SELECT 1 FROM public.application_items WHERE product_id=p_id)
   OR EXISTS(SELECT 1 FROM public.appointment_additional_items WHERE product_id=p_id)
   OR EXISTS(SELECT 1 FROM public.appointment_product_consumption WHERE product_id=p_id)
   OR EXISTS(SELECT 1 FROM public.product_purchases WHERE product_id=p_id AND started_using_at IS NOT NULL);
 IF v_has_history THEN
   UPDATE public.products SET is_active=false WHERE id=p_id;
   GET DIAGNOSTICS v_count = ROW_COUNT;
   IF v_count=0 THEN RAISE EXCEPTION 'Sem permissão para excluir este produto.' USING ERRCODE='42501'; END IF;
   RETURN jsonb_build_object('result','archived');
 END IF;
 PERFORM set_config('app.deleting_product_id', p_id::text, true);
 DELETE FROM public.products WHERE id=p_id;
 GET DIAGNOSTICS v_count = ROW_COUNT;
 PERFORM set_config('app.deleting_product_id', '', true);
 IF v_count=0 THEN RAISE EXCEPTION 'Sem permissão para excluir este produto.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('result','deleted');
END $$;
REVOKE ALL ON FUNCTION public.delete_product_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_safe(uuid) TO authenticated, service_role;