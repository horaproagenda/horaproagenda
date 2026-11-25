CREATE OR REPLACE FUNCTION public.protect_used_purchase_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_setting('app.deleting_product_id', true) = OLD.product_id::text THEN RETURN OLD; END IF;
 IF OLD.started_using_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.product_usage_records WHERE purchase_id=OLD.id) THEN RAISE EXCEPTION 'Esta compra possui um registro de uso. Preserve o histórico e corrija o ciclo ou registre um ajuste de estoque.'; END IF;
 RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.guard_official_consumption()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP='DELETE' AND current_setting('app.deleting_product_id', true) = OLD.product_id::text THEN RETURN OLD; END IF;
 IF current_user IN ('authenticated','anon') AND ((TG_OP='INSERT' AND (NEW.request_id IS NOT NULL OR NEW.cycle_key IS NOT NULL)) OR (TG_OP IN ('UPDATE','DELETE') AND (OLD.request_id IS NOT NULL OR OLD.cycle_key IS NOT NULL))) THEN RAISE EXCEPTION 'Altere este consumo pela operação oficial do produto.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.delete_product_safe(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_ok boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão para excluir este produto.' USING ERRCODE='42501'; END IF;
 -- Permissão: o produto precisa ser editável pelo usuário (respeita RLS do chamador).
 SET LOCAL ROLE authenticated;
 UPDATE public.products SET updated_at = updated_at WHERE id = p_id RETURNING name INTO v_name;
 v_ok := FOUND;
 RESET ROLE;
 IF NOT v_ok THEN RAISE EXCEPTION 'Produto não encontrado ou sem permissão para excluir.' USING ERRCODE='42501'; END IF;

 PERFORM set_config('app.deleting_product_id', p_id::text, true);
 UPDATE public.appointment_additional_items
    SET notes = COALESCE(NULLIF(btrim(notes),''), v_name), product_id = NULL
  WHERE product_id = p_id;
 UPDATE public.application_items SET product_id = NULL WHERE product_id = p_id;
 DELETE FROM public.product_usage_events WHERE product_id = p_id;
 DELETE FROM public.product_daily_consumption WHERE product_id = p_id;
 DELETE FROM public.appointment_product_consumption WHERE product_id = p_id;
 DELETE FROM public.product_usage_records WHERE product_id = p_id;
 DELETE FROM public.service_products WHERE product_id = p_id;
 DELETE FROM public.package_template_products WHERE product_id = p_id;
 DELETE FROM public.product_purchases WHERE product_id = p_id;
 DELETE FROM public.products WHERE id = p_id;
 PERFORM set_config('app.deleting_product_id', '', true);
 RETURN jsonb_build_object('result','deleted');
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_product_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_product_safe(uuid) TO authenticated;