CREATE OR REPLACE FUNCTION public.resolve_boleto_payment_method(_owner uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF _owner IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v FROM payment_methods WHERE account_owner_id = _owner AND name ILIKE '%boleto%'
    ORDER BY is_active DESC, created_at LIMIT 1;
  IF v IS NULL THEN
    INSERT INTO payment_methods(name, is_active, account_owner_id, created_by)
    VALUES ('Boleto Bancário', true, _owner, _owner) RETURNING id INTO v;
  ELSE
    UPDATE payment_methods SET is_active = true WHERE id = v AND NOT is_active;
  END IF;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.resolve_boleto_payment_method(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_payment_method_on_paid_income()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_boleto boolean := false; v_owner uuid; v_sale_owner uuid;
BEGIN
  IF NEW.type NOT IN ('income','receivable') THEN RETURN NEW; END IF;

  is_boleto := COALESCE(NEW.notes,'') ILIKE '%[boleto:%';
  IF NEW.sale_id IS NOT NULL THEN
    SELECT s.account_owner_id,
           (pm.name ILIKE '%boleto%') OR EXISTS (SELECT 1 FROM boleto_installments b WHERE b.sale_id = s.id)
      INTO v_sale_owner, is_boleto
      FROM single_sales s LEFT JOIN payment_methods pm ON pm.id = s.payment_method_id
     WHERE s.id = NEW.sale_id;
    is_boleto := COALESCE(is_boleto,false) OR COALESCE(NEW.notes,'') ILIKE '%[boleto:%';
  END IF;

  IF is_boleto THEN
    v_owner := COALESCE(NEW.account_owner_id, v_sale_owner,
                        public.get_account_owner_for_user(NEW.created_by), public.current_account_owner_id());
    IF NEW.payment_method_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM payment_methods WHERE id = NEW.payment_method_id AND name ILIKE '%boleto%') THEN
      NEW.payment_method_id := COALESCE(public.resolve_boleto_payment_method(v_owner), NEW.payment_method_id);
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM 'paid' OR NEW.payment_method_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND OLD.payment_method_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT payment_method_id INTO NEW.payment_method_id FROM single_sales WHERE id = NEW.sale_id;
  END IF;
  IF NEW.payment_method_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento antes de confirmar o recebimento.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_payment_method_on_paid_income() FROM PUBLIC, anon, authenticated;

-- Backfill: parcelas de boleto pagas sem forma
UPDATE public.financial_entries SET updated_at = now()
 WHERE status = 'paid' AND type IN ('income','receivable') AND payment_method_id IS NULL
   AND (notes ILIKE '%[boleto:%' OR description ILIKE 'Boleto %');