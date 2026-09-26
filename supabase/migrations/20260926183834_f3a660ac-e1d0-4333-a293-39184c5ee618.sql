CREATE OR REPLACE FUNCTION public.register_product_purchase(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric DEFAULT 0,
  p_total_price numeric DEFAULT 0,
  p_supplier text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_purchase_date date DEFAULT CURRENT_DATE,
  p_expiry_date date DEFAULT NULL,
  p_payment_method_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_skip_cash_transaction boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_prof_me uuid;
  v_product public.products;
  v_purchase public.product_purchases;
  v_new_qty numeric;
  v_new_total numeric;
  v_new_unit numeric;
  v_dest record;
  v_register uuid;
  v_allowed boolean;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o produto da compra.' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe a quantidade comprada.' USING ERRCODE = 'P0001';
  END IF;

  v_owner := public.get_user_account_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para registrar esta compra.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = p_product_id
     AND account_owner_id = v_owner;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado nesta conta.' USING ERRCODE = 'P0001';
  END IF;

  v_prof_me := public.get_professional_id_for_user(auth.uid());

  v_allowed := public.is_account_admin(auth.uid())
            OR public.has_role(auth.uid(), 'receptionist')
            OR (v_product.owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
            OR (v_product.owner_professional_id IS NOT NULL AND v_product.owner_professional_id = v_prof_me);

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar compras deste produto.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.product_purchases (
    product_id, quantity, unit_price, total_price, supplier, supplier_id,
    purchase_date, payment_method_id, payment_method, notes,
    owner_professional_id, account_owner_id, created_by, updated_by
  ) VALUES (
    p_product_id, p_quantity, COALESCE(p_unit_price, 0), COALESCE(p_total_price, 0),
    NULLIF(p_supplier, ''), p_supplier_id,
    COALESCE(p_purchase_date, CURRENT_DATE), p_payment_method_id, NULLIF(p_payment_method, ''),
    NULLIF(p_notes, ''), v_product.owner_professional_id, v_owner, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_purchase;

  -- Estoque atualizado na mesma operação
  v_new_qty   := COALESCE(v_product.quantity_purchased, 0) + p_quantity;
  v_new_total := COALESCE(v_product.total_price, 0) + COALESCE(p_total_price, 0);
  v_new_unit  := CASE WHEN v_new_qty > 0 THEN v_new_total / v_new_qty ELSE v_product.unit_price END;

  UPDATE public.products
     SET current_stock      = COALESCE(current_stock, 0) + p_quantity,
         quantity_purchased = v_new_qty,
         total_price        = v_new_total,
         unit_price         = v_new_unit,
         supplier           = COALESCE(NULLIF(p_supplier, ''), supplier),
         supplier_id        = COALESCE(p_supplier_id, supplier_id),
         purchase_date      = COALESCE(p_purchase_date, purchase_date),
         expiry_date        = COALESCE(p_expiry_date, expiry_date),
         updated_at         = now()
   WHERE id = p_product_id
  RETURNING * INTO v_product;

  -- Saída no caixa, quando a compra não está marcada como já paga
  IF NOT COALESCE(p_skip_cash_transaction, false) THEN
    SELECT * INTO v_dest
      FROM public.resolve_financial_destination(v_product.owner_professional_id, v_owner);

    v_register := v_dest.cash_register_id;

    IF v_register IS NULL THEN
      SELECT cr.id INTO v_register
        FROM public.cash_registers cr
       WHERE cr.account_owner_id = v_owner
         AND cr.status = 'open'
       ORDER BY cr.opened_at DESC
       LIMIT 1;
    END IF;

    IF v_register IS NOT NULL THEN
      INSERT INTO public.cash_transactions (
        cash_register_id, type, category, description, amount,
        payment_method, reference_id, reference_type,
        professional_id, account_owner_id, created_by
      ) VALUES (
        v_register, 'expense', 'product_purchase',
        'Compra: ' || COALESCE(v_product.name, 'Produto'),
        COALESCE(p_total_price, 0),
        NULLIF(p_payment_method, ''), v_purchase.id, 'product_purchase',
        (SELECT cr.professional_id FROM public.cash_registers cr WHERE cr.id = v_register),
        v_owner, auth.uid()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'purchase', to_jsonb(v_purchase),
    'product', to_jsonb(v_product),
    'cash_register_id', v_register
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_product_purchase(uuid, numeric, numeric, numeric, text, uuid, date, date, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_product_purchase(uuid, numeric, numeric, numeric, text, uuid, date, date, uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_product_purchase(uuid, numeric, numeric, numeric, text, uuid, date, date, uuid, text, text, boolean) TO service_role;