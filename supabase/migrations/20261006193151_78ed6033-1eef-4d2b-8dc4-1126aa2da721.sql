CREATE OR REPLACE FUNCTION public.sync_product_purchase_finance(_purchase_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  -- Produto já pago: só estoque e histórico de compras; nada no Financeiro nem no Caixa.
  IF COALESCE(v_purchase.skip_cash_transaction, false) THEN RETURN; END IF;

  INSERT INTO public.financial_entries (
    type, description, amount, due_date, paid_date, status,
    payment_method_id, professional_id, account_owner_id,
    created_by, notes, source_type, source_id
  ) VALUES (
    'expense', v_desc, v_amount, v_purchase.purchase_date, v_purchase.purchase_date, 'paid',
    v_purchase.payment_method_id, v_product.owner_professional_id, v_purchase.account_owner_id, v_created_by,
    'Gerado automaticamente pela compra de produto', 'product_purchase', _purchase_id
  );

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
END; $function$;