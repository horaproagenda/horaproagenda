CREATE OR REPLACE FUNCTION public.enforce_payment_method_on_paid_income()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type NOT IN ('income','receivable') OR NEW.status IS DISTINCT FROM 'paid' OR NEW.payment_method_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Atualizações em registros antigos já pagos sem forma não são bloqueadas.
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND OLD.payment_method_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Herda da venda vinculada
  IF NEW.sale_id IS NOT NULL THEN
    SELECT payment_method_id INTO NEW.payment_method_id FROM single_sales WHERE id = NEW.sale_id;
  END IF;
  -- Parcela de boleto: usa a forma "Boleto" da clínica
  IF NEW.payment_method_id IS NULL AND (COALESCE(NEW.notes,'') ILIKE '%[boleto:%' OR COALESCE(NEW.description,'') ILIKE 'Boleto %') THEN
    SELECT id INTO NEW.payment_method_id FROM payment_methods
     WHERE name ILIKE '%boleto%' AND is_active
       AND (account_owner_id IS NULL OR account_owner_id = public.current_account_owner_id())
     ORDER BY (account_owner_id IS NULL) LIMIT 1;
  END IF;
  IF NEW.payment_method_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento antes de confirmar o recebimento.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_payment_method_on_paid_income ON public.financial_entries;
CREATE TRIGGER trg_enforce_payment_method_on_paid_income
BEFORE INSERT OR UPDATE ON public.financial_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_method_on_paid_income();