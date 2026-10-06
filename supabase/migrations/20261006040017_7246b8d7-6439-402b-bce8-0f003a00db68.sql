ALTER TABLE public.product_purchases ADD COLUMN IF NOT EXISTS skip_cash_transaction boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.require_product_purchase_payment_method()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NOT COALESCE(NEW.skip_cash_transaction, false)
     AND NEW.payment_method_id IS NULL
     AND NULLIF(BTRIM(NEW.payment_method), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a forma de pagamento da compra ou marque "Produto já pago".'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_require_product_purchase_payment_method ON public.product_purchases;
CREATE TRIGGER trg_require_product_purchase_payment_method BEFORE INSERT OR UPDATE OF payment_method_id, payment_method, skip_cash_transaction ON public.product_purchases FOR EACH ROW EXECUTE FUNCTION require_product_purchase_payment_method();

DROP TRIGGER IF EXISTS trg_sync_product_purchase_finance ON public.product_purchases;
CREATE TRIGGER trg_sync_product_purchase_finance AFTER INSERT OR UPDATE OF product_id, quantity, total_price, purchase_date, payment_method_id, payment_method, account_owner_id, created_by, skip_cash_transaction ON public.product_purchases FOR EACH ROW EXECUTE FUNCTION trg_sync_product_purchase_finance();

CREATE OR REPLACE FUNCTION public.sync_product_purchase_finance(_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_purchase public.product_purchases%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_register uuid;
  v_dest record;
  v_created_by uuid;
  v_amount numeric;
  v_desc text;
BEGIN
  SELECT * INTO v_purchase FROM public.product_purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_purchase.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto da compra não encontrado.' USING ERRCODE='P0001'; END IF;

  v_created_by := COALESCE(v_purchase.created_by, auth.uid());
  v_amount := GREATEST(COALESCE(v_purchase.total_price, 0), 0);
  v_desc := 'Compra de produto: ' || v_product.name;

  DELETE FROM public.financial_entries WHERE source_type = 'product_purchase' AND source_id = _purchase_id;
  DELETE FROM public.cash_transactions WHERE reference_type = 'product_purchase' AND reference_id = _purchase_id;

  IF v_amount <= 0 THEN RETURN; END IF;

  INSERT INTO public.financial_entries (
    type, description, amount, due_date, paid_date, status,
    payment_method_id, professional_id, account_owner_id,
    created_by, notes, source_type, source_id
  ) VALUES (
    'expense', v_desc, v_amount, v_purchase.purchase_date, v_purchase.purchase_date, 'paid',
    v_purchase.payment_method_id, v_product.owner_professional_id, v_purchase.account_owner_id, v_created_by,
    CASE WHEN v_purchase.skip_cash_transaction THEN 'Produto já pago (sem saída no caixa)'
         ELSE 'Gerado automaticamente pela compra de produto' END,
    'product_purchase', _purchase_id
  );

  IF COALESCE(v_purchase.skip_cash_transaction, false) THEN RETURN; END IF;

  BEGIN
    SELECT * INTO v_dest FROM public.resolve_financial_destination(v_product.owner_professional_id, v_purchase.account_owner_id);
    v_register := v_dest.cash_register_id;
  EXCEPTION WHEN OTHERS THEN v_register := NULL;
  END;

  IF v_register IS NULL THEN
    SELECT cr.id INTO v_register FROM public.cash_registers cr
     WHERE cr.account_owner_id = v_purchase.account_owner_id AND cr.status = 'open'
     ORDER BY (cr.professional_id IS NOT DISTINCT FROM v_product.owner_professional_id) DESC, cr.opened_at DESC
     LIMIT 1;
  END IF;

  IF v_register IS NULL THEN RETURN; END IF;

  INSERT INTO public.cash_transactions (
    cash_register_id, type, category, description, amount,
    payment_method, reference_id, reference_type, created_by,
    account_owner_id, professional_id
  ) VALUES (
    v_register, 'expense', 'product_purchase', v_desc, v_amount,
    NULLIF(BTRIM(v_purchase.payment_method), ''), _purchase_id, 'product_purchase',
    v_created_by, v_purchase.account_owner_id,
    (SELECT cr.professional_id FROM public.cash_registers cr WHERE cr.id = v_register)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.register_product_purchase(
  p_product_id uuid, p_quantity numeric, p_unit_price numeric DEFAULT 0, p_total_price numeric DEFAULT 0,
  p_supplier text DEFAULT NULL, p_supplier_id uuid DEFAULT NULL, p_purchase_date date DEFAULT CURRENT_DATE,
  p_expiry_date date DEFAULT NULL, p_payment_method_id uuid DEFAULT NULL, p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_skip_cash_transaction boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_owner uuid; v_prof_me uuid;
  v_product public.products; v_purchase public.product_purchases;
  v_new_qty numeric; v_new_total numeric; v_new_unit numeric;
  v_allowed boolean; v_register uuid;
BEGIN
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'Selecione o produto da compra.' USING ERRCODE='P0001'; END IF;
  IF COALESCE(p_quantity,0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade comprada.' USING ERRCODE='P0001'; END IF;
  IF NOT COALESCE(p_skip_cash_transaction,false) AND p_payment_method_id IS NULL AND NULLIF(BTRIM(p_payment_method),'') IS NULL THEN
    RAISE EXCEPTION 'Informe a forma de pagamento da compra ou marque "Produto já pago".' USING ERRCODE='P0001';
  END IF;

  v_owner := public.get_user_account_owner_id(auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Sem permissão para registrar esta compra.' USING ERRCODE='P0001'; END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND account_owner_id = v_owner;
  IF v_product.id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado nesta conta.' USING ERRCODE='P0001'; END IF;

  v_prof_me := public.get_professional_id_for_user(auth.uid());
  v_allowed := public.is_account_admin(auth.uid())
            OR public.has_role(auth.uid(), 'receptionist')
            OR (v_product.owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
            OR (v_product.owner_professional_id IS NOT NULL AND v_product.owner_professional_id = v_prof_me);
  IF NOT v_allowed THEN RAISE EXCEPTION 'Você não tem permissão para registrar compras deste produto.' USING ERRCODE='P0001'; END IF;

  INSERT INTO public.product_purchases (
    product_id, quantity, unit_price, total_price, supplier, supplier_id,
    purchase_date, payment_method_id, payment_method, notes, skip_cash_transaction,
    owner_professional_id, account_owner_id, created_by, updated_by
  ) VALUES (
    p_product_id, p_quantity, COALESCE(p_unit_price,0), COALESCE(p_total_price,0),
    NULLIF(p_supplier,''), p_supplier_id, COALESCE(p_purchase_date, CURRENT_DATE),
    p_payment_method_id, NULLIF(p_payment_method,''), NULLIF(p_notes,''), COALESCE(p_skip_cash_transaction,false),
    v_product.owner_professional_id, v_owner, auth.uid(), auth.uid()
  ) RETURNING * INTO v_purchase;

  v_new_qty := COALESCE(v_product.quantity_purchased,0) + p_quantity;
  v_new_total := COALESCE(v_product.total_price,0) + COALESCE(p_total_price,0);
  v_new_unit := CASE WHEN v_new_qty > 0 THEN v_new_total / v_new_qty ELSE v_product.unit_price END;

  UPDATE public.products SET
    current_stock = COALESCE(current_stock,0) + p_quantity,
    quantity_purchased = v_new_qty, total_price = v_new_total, unit_price = v_new_unit,
    supplier = COALESCE(NULLIF(p_supplier,''), supplier),
    supplier_id = COALESCE(p_supplier_id, supplier_id),
    purchase_date = COALESCE(p_purchase_date, purchase_date),
    expiry_date = COALESCE(p_expiry_date, expiry_date),
    updated_at = now()
  WHERE id = p_product_id RETURNING * INTO v_product;

  SELECT cash_register_id INTO v_register FROM public.cash_transactions
   WHERE reference_type='product_purchase' AND reference_id = v_purchase.id LIMIT 1;

  RETURN jsonb_build_object('purchase', to_jsonb(v_purchase), 'product', to_jsonb(v_product), 'cash_register_id', v_register);
END; $$;

REVOKE ALL ON FUNCTION public.register_product_purchase(uuid, numeric, numeric, numeric, text, uuid, date, date, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_product_purchase(uuid, numeric, numeric, numeric, text, uuid, date, date, uuid, text, text, boolean) TO authenticated, service_role;

-- Limpeza: saídas sem caixa e duplicadas de compras
DELETE FROM public.cash_transactions WHERE reference_type='product_purchase' AND cash_register_id IS NULL;
DELETE FROM public.cash_transactions ct USING public.cash_transactions ct2
 WHERE ct.reference_type='product_purchase' AND ct2.reference_type='product_purchase'
   AND ct.reference_id = ct2.reference_id AND ct.id > ct2.id;
UPDATE public.cash_transactions SET amount = abs(amount) WHERE reference_type='product_purchase' AND amount < 0;