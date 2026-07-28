CREATE OR REPLACE FUNCTION public.sync_appointments_with_paid_sale(_sale_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sale RECORD;
  _updated integer := 0;
  _payment_method text;
  _methods text[];
  _paid numeric;
  _open_installments integer := 0;
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF NOT FOUND OR _sale.paid_at IS NULL THEN
    RETURN 0;
  END IF;

  SELECT pm.name INTO _payment_method
  FROM public.payment_methods pm
  WHERE pm.id = _sale.payment_method_id
  LIMIT 1;

  -- Boleto parcelado: só libera como pago quando não há parcelas em aberto
  SELECT count(*) INTO _open_installments
  FROM public.boleto_installments bi
  WHERE bi.sale_id = _sale_id
    AND bi.status NOT IN ('cancelled', 'paid');

  IF _open_installments > 0 THEN
    RETURN 0;
  END IF;

  _methods := CASE
    WHEN COALESCE(_payment_method, '') = '' THEN ARRAY[]::text[]
    ELSE ARRAY[_payment_method]
  END;
  _paid := COALESCE(_sale.final_amount, 0);

  IF _sale.item_type = 'package' AND _sale.package_id IS NOT NULL THEN
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid, 0), _paid),
           payment_methods = CASE
             WHEN cardinality(COALESCE(a.payment_methods, ARRAY[]::text[])) > 0 THEN a.payment_methods
             ELSE _methods
           END,
           updated_at = now()
     WHERE a.client_id = _sale.client_id
       AND a.package_appointment_id IN (
         SELECT id FROM public.package_appointments WHERE package_id = _sale.package_id
       )
       AND (
         a.payment_status IS DISTINCT FROM 'paid'
         OR COALESCE(a.amount_paid, 0) < _paid
       );
    GET DIAGNOSTICS _updated = ROW_COUNT;

  ELSIF _sale.item_type = 'service' AND _sale.service_id IS NOT NULL THEN
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid, 0), COALESCE(cs.amount_paid, _paid, 0)),
           payment_methods = CASE
             WHEN cardinality(COALESCE(a.payment_methods, ARRAY[]::text[])) > 0 THEN a.payment_methods
             ELSE _methods
           END,
           updated_at = now()
      FROM public.client_services cs
     WHERE cs.sale_id = _sale_id
       AND cs.appointment_id = a.id
       AND (
         a.payment_status IS DISTINCT FROM 'paid'
         OR cardinality(COALESCE(a.payment_methods, ARRAY[]::text[])) = 0
       );
    GET DIAGNOSTICS _updated = ROW_COUNT;
  END IF;

  RETURN _updated;
END;
$function$;

SELECT public.repair_payment_integrity();