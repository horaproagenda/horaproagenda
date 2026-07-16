CREATE OR REPLACE FUNCTION public.is_boleto_installment_sale(_sale_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.single_sales s
    JOIN public.payment_methods pm ON pm.id = s.payment_method_id
    WHERE s.id = _sale_id
      AND pm.name ILIKE '%boleto%'
      AND EXISTS (
        SELECT 1
        FROM public.boleto_installments bi
        WHERE bi.sale_id = s.id
          AND bi.status <> 'cancelled'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.reconcile_sale_payment_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_exists boolean;
  v_payment_method text;
  v_amount numeric;
  v_client_id uuid;
  v_processed_by uuid;
  v_payment_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.paid_at IS NULL THEN RETURN NEW; END IF;
    IF OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT pm.name INTO v_payment_method
  FROM public.payment_methods pm
  WHERE pm.id = NEW.payment_method_id
  LIMIT 1;

  -- Boleto parcelado é registrado parcela a parcela. Quando a última parcela
  -- é paga, single_sales.paid_at é preenchido apenas para marcar a venda como
  -- quitada; não deve criar uma entrada extra pelo valor total.
  IF COALESCE(v_payment_method, '') ILIKE '%boleto%'
     AND EXISTS (
       SELECT 1
       FROM public.boleto_installments bi
       WHERE bi.sale_id = NEW.id
         AND bi.status <> 'cancelled'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.payments_audit WHERE single_sale_id = NEW.id) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.final_amount, NEW.original_amount - COALESCE(NEW.discount_amount,0));
  v_client_id := NEW.client_id;
  v_processed_by := NEW.paid_by;
  IF v_payment_method IS NULL THEN v_payment_method := 'unknown'; END IF;

  IF v_payment_method ILIKE '%credit%' OR v_payment_method ILIKE '%credito%' THEN
    v_payment_type := 'credit_to_client';
  ELSIF v_amount IS NOT NULL AND v_amount = 0 THEN
    v_payment_type := 'discount';
  ELSE
    v_payment_type := 'cash_in';
  END IF;

  PERFORM public.process_payment_low(NEW.id, v_client_id, v_processed_by, v_payment_method, v_amount, v_payment_type, 'reconciled by trigger');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_appointments_with_paid_sale(_sale_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sale RECORD;
  _pkg_total numeric;
  _svc_price numeric;
  _updated integer := 0;
  _payment_method text;
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF NOT FOUND OR _sale.paid_at IS NULL THEN
    RETURN 0;
  END IF;

  SELECT pm.name INTO _payment_method
  FROM public.payment_methods pm
  WHERE pm.id = _sale.payment_method_id
  LIMIT 1;

  -- Vendas por boleto parcelado não devem copiar o valor total para cada
  -- aplicação/agendamento. A baixa financeira fica nas parcelas de boleto.
  IF COALESCE(_payment_method, '') ILIKE '%boleto%'
     AND EXISTS (
       SELECT 1
       FROM public.boleto_installments bi
       WHERE bi.sale_id = _sale_id
         AND bi.status <> 'cancelled'
     ) THEN
    RETURN 0;
  END IF;

  IF _sale.item_type = 'package' AND _sale.package_id IS NOT NULL THEN
    SELECT total_price INTO _pkg_total FROM public.service_packages WHERE id = _sale.package_id;
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid,0), COALESCE(_pkg_total,0)),
           updated_at = now()
     WHERE a.client_id = _sale.client_id
       AND a.package_appointment_id IN (
         SELECT id FROM public.package_appointments WHERE package_id = _sale.package_id
       )
       AND (a.payment_status IS DISTINCT FROM 'paid' OR COALESCE(a.amount_paid,0) < COALESCE(_pkg_total,0));
    GET DIAGNOSTICS _updated = ROW_COUNT;

  ELSIF _sale.item_type = 'service' AND _sale.service_id IS NOT NULL THEN
    SELECT price INTO _svc_price FROM public.services WHERE id = _sale.service_id;
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid,0), COALESCE(_sale.final_amount, _svc_price, 0)),
           updated_at = now()
     WHERE a.client_id = _sale.client_id
       AND a.service_id = _sale.service_id
       AND a.package_appointment_id IS NULL
       AND a.payment_status IS DISTINCT FROM 'paid'
       AND a.start_time >= _sale.sale_date::timestamptz - INTERVAL '1 day';
    GET DIAGNOSTICS _updated = ROW_COUNT;
  END IF;

  RETURN _updated;
END;
$$;