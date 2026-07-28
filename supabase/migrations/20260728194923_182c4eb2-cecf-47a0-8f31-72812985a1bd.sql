-- 1) Rewrite sale->appointment payment sync to be evidence-scoped
CREATE OR REPLACE FUNCTION public.sync_appointments_with_paid_sale(_sale_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sale RECORD;
  _pkg_total numeric;
  _updated integer := 0;
  _payment_method text;
  _methods text[];
  _paid numeric;
  _status text;
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF NOT FOUND OR _sale.paid_at IS NULL THEN
    RETURN 0;
  END IF;

  SELECT pm.name INTO _payment_method
  FROM public.payment_methods pm
  WHERE pm.id = _sale.payment_method_id
  LIMIT 1;

  -- Boleto parcelado: a baixa fica nas parcelas, nunca no agendamento
  IF COALESCE(_payment_method, '') ILIKE '%boleto%'
     AND EXISTS (
       SELECT 1 FROM public.boleto_installments bi
       WHERE bi.sale_id = _sale_id AND bi.status <> 'cancelled'
     ) THEN
    RETURN 0;
  END IF;

  _methods := CASE
    WHEN COALESCE(_payment_method, '') = '' THEN ARRAY[]::text[]
    ELSE ARRAY[_payment_method]
  END;

  IF _sale.item_type = 'package' AND _sale.package_id IS NOT NULL THEN
    SELECT total_price INTO _pkg_total FROM public.service_packages WHERE id = _sale.package_id;
    _paid := COALESCE(_sale.final_amount, 0);
    _status := CASE
      WHEN COALESCE(_pkg_total, 0) > 0 AND _paid >= COALESCE(_pkg_total, 0) THEN 'paid'
      WHEN _paid > 0 THEN 'partial'
      ELSE 'pending'
    END;

    IF _status = 'pending' THEN
      RETURN 0;
    END IF;

    UPDATE public.appointments a
       SET payment_status = _status,
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
         a.payment_status IS DISTINCT FROM _status
         OR COALESCE(a.amount_paid, 0) < _paid
         OR cardinality(COALESCE(a.payment_methods, ARRAY[]::text[])) = 0
       );
    GET DIAGNOSTICS _updated = ROW_COUNT;

  ELSIF _sale.item_type = 'service' AND _sale.service_id IS NOT NULL THEN
    -- Somente as aplicações efetivamente consumidas por esta venda
    UPDATE public.appointments a
       SET payment_status = 'paid',
           amount_paid = GREATEST(COALESCE(a.amount_paid, 0), COALESCE(cs.amount_paid, _sale.final_amount, 0)),
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

-- 2) Evidence-based backfill: revert "paid" appointments with no payment proof
CREATE OR REPLACE FUNCTION public.backfill_reset_unbacked_paid_appointments()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _updated integer := 0;
BEGIN
  UPDATE public.appointments a
     SET payment_status = 'pending',
         amount_paid = 0,
         payment_date = NULL,
         updated_at = now()
   WHERE a.payment_status IN ('paid', 'partial')
     AND cardinality(COALESCE(a.payment_methods, ARRAY[]::text[])) = 0
     AND NOT EXISTS (
       SELECT 1 FROM public.client_services cs WHERE cs.appointment_id = a.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_entries fe
       WHERE fe.appointment_id = a.id AND fe.paid_date IS NOT NULL
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.package_appointments pa
       JOIN public.service_packages sp ON sp.id = pa.package_id
       WHERE pa.id = a.package_appointment_id
         AND (
           cardinality(COALESCE(sp.payment_methods, ARRAY[]::text[])) > 0
           OR EXISTS (
             SELECT 1 FROM public.single_sales ss
             WHERE ss.package_id = sp.id AND ss.paid_at IS NOT NULL
           )
         )
     );
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_reset_unbacked_paid_appointments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_reset_unbacked_paid_appointments() TO authenticated, service_role;

-- 3) Run the backfill once
SELECT public.backfill_reset_unbacked_paid_appointments();