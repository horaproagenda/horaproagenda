DROP FUNCTION IF EXISTS public.update_product_purchase(uuid,numeric,numeric,numeric,date,text,date,date,uuid,text);

CREATE OR REPLACE FUNCTION public.update_product_purchase(
  p_id uuid, p_quantity numeric, p_unit_price numeric, p_total_price numeric,
  p_purchase_date date, p_supplier text, p_started_using_at date, p_finished_at date,
  p_payment_method_id uuid, p_payment_method text, p_skip_cash_transaction boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_old public.product_purchases; v_new public.product_purchases; v_product public.products; v_delta numeric; v_skip boolean;
BEGIN
  IF COALESCE(p_quantity,0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade comprada.' USING ERRCODE='P0001'; END IF;
  IF COALESCE(p_total_price,0) < 0 THEN RAISE EXCEPTION 'O valor total não pode ser negativo.' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_old FROM public.product_purchases WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Compra não encontrada.' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_old.product_id FOR UPDATE;
  IF NOT public._can_manage_product_purchase(v_product) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar compras deste produto.' USING ERRCODE='P0001'; END IF;

  v_skip := COALESCE(p_skip_cash_transaction, v_old.skip_cash_transaction, false);
  -- Compra antiga sem forma de pagamento: trata como já paga em vez de bloquear a correção.
  IF NOT v_skip AND p_payment_method_id IS NULL AND NULLIF(BTRIM(p_payment_method),'') IS NULL THEN
    v_skip := true;
  END IF;

  v_delta := p_quantity - COALESCE(v_old.quantity,0);
  IF COALESCE(v_product.current_stock,0) + v_delta < 0 THEN
    RAISE EXCEPTION 'Não é possível reduzir para essa quantidade: parte dessa compra já foi usada. Estoque atual: %.', v_product.current_stock USING ERRCODE='P0001';
  END IF;

  UPDATE public.product_purchases SET
    quantity = p_quantity,
    unit_price = CASE WHEN p_quantity > 0 THEN ROUND(COALESCE(p_total_price,0) / p_quantity, 6) ELSE COALESCE(p_unit_price,0) END,
    total_price = COALESCE(p_total_price,0),
    purchase_date = COALESCE(p_purchase_date, purchase_date), supplier = NULLIF(p_supplier,''),
    started_using_at = p_started_using_at, finished_at = p_finished_at,
    payment_method_id = CASE WHEN v_skip THEN NULL ELSE p_payment_method_id END,
    payment_method = CASE WHEN v_skip THEN NULL ELSE NULLIF(p_payment_method,'') END,
    skip_cash_transaction = v_skip,
    updated_by = auth.uid(), updated_at = now()
  WHERE id = p_id RETURNING * INTO v_new;

  PERFORM public.sync_product_purchase_finance(p_id);

  UPDATE public.products SET
    current_stock = COALESCE(current_stock,0) + v_delta,
    quantity_purchased = GREATEST(COALESCE(quantity_purchased,0) + v_delta, 0),
    total_price = GREATEST(COALESCE(total_price,0) + COALESCE(p_total_price,0) - COALESCE(v_old.total_price,0), 0),
    updated_at = now()
  WHERE id = v_product.id RETURNING * INTO v_product;

  RETURN jsonb_build_object('purchase', to_jsonb(v_new), 'product', to_jsonb(v_product));
END; $function$;

-- Ficha unificada do produto: compras, totais, estoque e alerta, tudo pelo ID do produto.
CREATE OR REPLACE FUNCTION public.get_product_ledger(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_product public.products; v_purch jsonb; v_qty numeric; v_total numeric; v_used numeric;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF v_product.id IS NULL OR NOT public._can_manage_product_purchase(v_product) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE='P0001'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'purchase_date',purchase_date,'quantity',quantity,
           'unit_price',unit_price,'total_price',total_price,'already_paid',skip_cash_transaction) ORDER BY purchase_date DESC),'[]'::jsonb),
         COALESCE(SUM(quantity),0), COALESCE(SUM(total_price),0)
    INTO v_purch, v_qty, v_total FROM public.product_purchases WHERE product_id = p_product_id;
  SELECT COALESCE(SUM(quantity_used),0) INTO v_used FROM public.appointment_product_consumption WHERE product_id = p_product_id;
  RETURN jsonb_build_object(
    'product_id', v_product.id, 'current_stock', v_product.current_stock, 'min_stock_alert', v_product.min_stock_alert,
    'low_stock', COALESCE(v_product.current_stock,0) <= COALESCE(v_product.min_stock_alert,0),
    'purchases', v_purch, 'purchased_quantity', v_qty, 'purchased_total', v_total,
    'consumed_in_appointments', v_used,
    'recorded_quantity_purchased', v_product.quantity_purchased,
    'totals_match', COALESCE(v_product.quantity_purchased,0) = v_qty AND COALESCE(v_product.total_price,0) = v_total);
END; $function$;

-- Reconciliação: realinha os totais do produto com as compras vinculadas ao seu ID (não mexe no estoque atual).
CREATE OR REPLACE FUNCTION public.reconcile_product_purchase_totals(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_product public.products;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_product.id IS NULL OR NOT public._can_manage_product_purchase(v_product) THEN
    RAISE EXCEPTION 'Produto não encontrado.' USING ERRCODE='P0001'; END IF;
  UPDATE public.products p SET
    quantity_purchased = s.q, total_price = s.t, updated_at = now()
  FROM (SELECT COALESCE(SUM(quantity),0) q, COALESCE(SUM(total_price),0) t FROM public.product_purchases WHERE product_id = p_product_id) s
  WHERE p.id = p_product_id AND (COALESCE(p.quantity_purchased,0) <> s.q OR COALESCE(p.total_price,0) <> s.t);
  RETURN public.get_product_ledger(p_product_id);
END; $function$;

REVOKE ALL ON FUNCTION public.update_product_purchase(uuid,numeric,numeric,numeric,date,text,date,date,uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_product_ledger(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_product_purchase_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_product_purchase(uuid,numeric,numeric,numeric,date,text,date,date,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_ledger(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_product_purchase_totals(uuid) TO authenticated;