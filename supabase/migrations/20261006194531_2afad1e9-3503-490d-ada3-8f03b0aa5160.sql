CREATE OR REPLACE FUNCTION public._can_manage_product_purchase(_product public.products)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _product.account_owner_id = public.get_user_account_owner_id(auth.uid()) AND (
    public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(), 'receptionist')
    OR (_product.owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
    OR (_product.owner_professional_id IS NOT NULL AND _product.owner_professional_id = public.get_professional_id_for_user(auth.uid())))
$$;

CREATE OR REPLACE FUNCTION public.update_product_purchase(
  p_id uuid, p_quantity numeric, p_unit_price numeric, p_total_price numeric,
  p_purchase_date date, p_supplier text, p_started_using_at date, p_finished_at date,
  p_payment_method_id uuid, p_payment_method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_old public.product_purchases; v_new public.product_purchases; v_product public.products; v_delta numeric;
BEGIN
  IF COALESCE(p_quantity,0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade comprada.' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_old FROM public.product_purchases WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_old.product_id FOR UPDATE;
  IF NOT public._can_manage_product_purchase(v_product) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar compras deste produto.' USING ERRCODE='P0001'; END IF;

  v_delta := p_quantity - COALESCE(v_old.quantity,0);
  IF COALESCE(v_product.current_stock,0) + v_delta < 0 THEN
    RAISE EXCEPTION 'Não é possível reduzir para essa quantidade: parte dessa compra já foi usada. Estoque atual: %.', v_product.current_stock USING ERRCODE='P0001';
  END IF;

  UPDATE public.product_purchases SET
    quantity = p_quantity, unit_price = COALESCE(p_unit_price,0), total_price = COALESCE(p_total_price,0),
    purchase_date = COALESCE(p_purchase_date, purchase_date), supplier = NULLIF(p_supplier,''),
    started_using_at = p_started_using_at, finished_at = p_finished_at,
    payment_method_id = p_payment_method_id, payment_method = NULLIF(p_payment_method,''),
    updated_by = auth.uid()
  WHERE id = p_id RETURNING * INTO v_new;

  UPDATE public.products SET
    current_stock = COALESCE(current_stock,0) + v_delta,
    quantity_purchased = GREATEST(COALESCE(quantity_purchased,0) + v_delta, 0),
    total_price = GREATEST(COALESCE(total_price,0) + COALESCE(p_total_price,0) - COALESCE(v_old.total_price,0), 0),
    updated_at = now()
  WHERE id = v_product.id RETURNING * INTO v_product;

  RETURN jsonb_build_object('purchase', to_jsonb(v_new), 'product', to_jsonb(v_product));
END; $function$;

CREATE OR REPLACE FUNCTION public.delete_product_purchase(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_old public.product_purchases; v_product public.products;
BEGIN
  SELECT * INTO v_old FROM public.product_purchases WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_old.product_id FOR UPDATE;
  IF NOT public._can_manage_product_purchase(v_product) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir compras deste produto.' USING ERRCODE='P0001'; END IF;

  DELETE FROM public.financial_entries WHERE source_type='product_purchase' AND source_id = p_id;
  DELETE FROM public.cash_transactions WHERE reference_type='product_purchase' AND reference_id = p_id;
  DELETE FROM public.product_purchases WHERE id = p_id;

  UPDATE public.products SET
    current_stock = GREATEST(COALESCE(current_stock,0) - COALESCE(v_old.quantity,0), 0),
    quantity_purchased = GREATEST(COALESCE(quantity_purchased,0) - COALESCE(v_old.quantity,0), 0),
    total_price = GREATEST(COALESCE(total_price,0) - COALESCE(v_old.total_price,0), 0),
    updated_at = now()
  WHERE id = v_product.id RETURNING * INTO v_product;
  RETURN jsonb_build_object('product', to_jsonb(v_product));
END; $function$;

REVOKE ALL ON FUNCTION public.update_product_purchase(uuid,numeric,numeric,numeric,date,text,date,date,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_product_purchase(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._can_manage_product_purchase(public.products) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_purchase(uuid,numeric,numeric,numeric,date,text,date,date,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_product_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._can_manage_product_purchase(public.products) TO authenticated;