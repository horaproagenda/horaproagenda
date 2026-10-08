CREATE OR REPLACE FUNCTION public.sync_package_sale_from_appointments(_package_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_paid int; v_max_amount numeric; v_date date; v_pm uuid; v_pm_name text; v_n int := 0;
BEGIN
  IF _package_id IS NULL THEN RETURN 0; END IF;
  -- O pagamento do pacote é replicado em todas as sessões agendadas; basta uma
  -- sessão quitada (ou valor pago >= total) para a venda estar quitada.
  SELECT count(*) FILTER (WHERE a.payment_status = 'paid'), max(coalesce(a.amount_paid,0)), max(a.payment_date)
    INTO v_paid, v_max_amount, v_date
  FROM public.package_appointments pa JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.package_id = _package_id;
  IF coalesce(v_paid,0) = 0 AND NOT EXISTS (
    SELECT 1 FROM public.single_sales s WHERE s.package_id = _package_id
      AND s.final_amount > 0 AND coalesce(v_max_amount,0) >= s.final_amount) THEN
    RETURN 0;
  END IF;
  SELECT a.payment_methods[1] INTO v_pm_name FROM public.package_appointments pa
    JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.package_id = _package_id AND a.payment_methods IS NOT NULL
    AND array_length(a.payment_methods,1) > 0 LIMIT 1;
  IF v_pm_name IS NOT NULL THEN
    SELECT pm.id INTO v_pm FROM public.payment_methods pm
      JOIN public.service_packages sp ON sp.id = _package_id
     WHERE lower(pm.name) = lower(v_pm_name) LIMIT 1;
  END IF;
  UPDATE public.single_sales s
     SET paid_at = COALESCE(v_date::timestamptz + interval '12 hours', now()),
         payment_method_id = COALESCE(s.payment_method_id, v_pm)
   WHERE s.package_id = _package_id AND s.paid_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = s.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN others THEN
  RAISE WARNING 'sync_package_sale_from_appointments failed: %', SQLERRM;
  RETURN 0;
END $function$;

-- Regulariza vendas antigas
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT package_id FROM public.single_sales
           WHERE item_type='package' AND paid_at IS NULL AND package_id IS NOT NULL LOOP
    PERFORM public.sync_package_sale_from_appointments(r.package_id);
  END LOOP;
END $$;