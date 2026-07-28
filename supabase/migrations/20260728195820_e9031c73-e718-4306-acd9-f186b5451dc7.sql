-- Sync: venda quitada (mesmo com desconto) => sessões pagas
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
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF NOT FOUND OR _sale.paid_at IS NULL THEN
    RETURN 0;
  END IF;

  SELECT pm.name INTO _payment_method
  FROM public.payment_methods pm
  WHERE pm.id = _sale.payment_method_id
  LIMIT 1;

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

-- Auditoria: usa venda quitada como evidência (sem comparar valor com desconto)
CREATE OR REPLACE FUNCTION public.audit_payment_integrity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'package_appointments_pending_with_paid_sale',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'appointment_id', a.id,
          'client_id', a.client_id,
          'package_id', sp.id,
          'package_name', sp.name,
          'sale_id', ss.id
        ))
        FROM public.appointments a
        JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
        JOIN public.service_packages sp ON sp.id = pa.package_id
        JOIN public.single_sales ss ON ss.package_id = sp.id AND ss.client_id = a.client_id
        WHERE ss.paid_at IS NOT NULL
          AND a.payment_status IS DISTINCT FROM 'paid'
      ), '[]'::jsonb),
    'service_appointments_pending_with_paid_sale',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'appointment_id', a.id,
          'client_id', a.client_id,
          'service_id', a.service_id,
          'sale_id', ss.id
        ))
        FROM public.appointments a
        JOIN public.client_services cs ON cs.appointment_id = a.id
        JOIN public.single_sales ss ON ss.id = cs.sale_id
        WHERE ss.paid_at IS NOT NULL
          AND a.package_appointment_id IS NULL
          AND a.payment_status IS DISTINCT FROM 'paid'
      ), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$function$;

-- Vinculação de sessão: considera venda quitada do pacote
CREATE OR REPLACE FUNCTION public.link_package_session_to_appointment(_package_id uuid, _appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record;
  v_appt record;
  v_pa record;
  v_service_id uuid;
  v_service_name text;
  v_package_paid numeric := 0;
  v_package_methods text[] := ARRAY[]::text[];
  v_package_status text := 'pending';
  v_sale_paid boolean := false;
  v_sale_amount numeric := 0;
BEGIN
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote não encontrado'; END IF;
  IF NOT public.can_access_service_package(_package_id) THEN
    RAISE EXCEPTION 'Sem permissão para usar este pacote';
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
  IF v_appt.client_id IS DISTINCT FROM v_pkg.client_id THEN
    RAISE EXCEPTION 'O agendamento não pertence ao cliente do pacote';
  END IF;

  PERFORM public.heal_package_service_links(_package_id);

  SELECT * INTO v_pa
  FROM public.package_appointments
  WHERE package_id = _package_id
    AND (appointment_id = _appointment_id OR (appointment_id IS NULL AND status IN ('pending','scheduled','rescheduled')))
  ORDER BY
    CASE WHEN appointment_id = _appointment_id THEN 0 ELSE 1 END,
    CASE WHEN scheduled_date IS NOT NULL THEN abs(extract(epoch from (scheduled_date - v_appt.start_time))) ELSE 999999999 END,
    COALESCE(sequence_order, session_number)
  LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Não há sessões disponíveis neste pacote'; END IF;

  v_service_id := COALESCE(v_pa.service_id, public.resolve_service_id_for_package(_package_id, COALESCE(v_pa.sequence_order, v_pa.session_number)));
  SELECT name INTO v_service_name FROM public.services WHERE id = v_service_id;

  SELECT COALESCE(max(a.amount_paid), 0) INTO v_package_paid
  FROM public.package_appointments pa
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.package_id = _package_id;

  SELECT true, COALESCE(max(ss.final_amount), 0) INTO v_sale_paid, v_sale_amount
  FROM public.single_sales ss
  WHERE ss.package_id = _package_id AND ss.paid_at IS NOT NULL
  HAVING count(*) > 0;

  v_sale_paid := COALESCE(v_sale_paid, false);
  v_package_paid := GREATEST(COALESCE(v_package_paid, 0), COALESCE(v_sale_amount, 0));

  SELECT COALESCE(array_agg(DISTINCT method), ARRAY[]::text[]) INTO v_package_methods
  FROM (
    SELECT unnest(COALESCE(v_pkg.payment_methods, ARRAY[]::text[])) AS method
    UNION
    SELECT unnest(COALESCE(a.payment_methods, ARRAY[]::text[])) AS method
    FROM public.package_appointments pa JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.package_id = _package_id
  ) methods WHERE method IS NOT NULL AND method <> '';

  v_package_status := CASE
    WHEN v_sale_paid THEN 'paid'
    WHEN COALESCE(v_pkg.total_price, 0) > 0 AND v_package_paid >= COALESCE(v_pkg.total_price, 0) THEN 'paid'
    WHEN v_package_paid > 0 THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE public.package_appointments
  SET appointment_id = _appointment_id,
      status = CASE WHEN v_appt.status IN ('completed','missed','cancelled','rescheduled') THEN v_appt.status::text ELSE 'scheduled' END,
      scheduled_date = v_appt.start_time,
      service_id = v_service_id,
      updated_at = now()
  WHERE id = v_pa.id;

  UPDATE public.appointments
  SET package_appointment_id = v_pa.id,
      service_id = v_service_id,
      service_name_snapshot = v_service_name,
      package_name_snapshot = v_pkg.name,
      payment_status = CASE WHEN v_appt.payment_status = 'paid' THEN v_appt.payment_status ELSE v_package_status END,
      amount_paid = GREATEST(COALESCE(v_appt.amount_paid, 0), COALESCE(v_package_paid, 0)),
      payment_methods = CASE WHEN cardinality(COALESCE(v_appt.payment_methods, ARRAY[]::text[])) > 0 THEN v_appt.payment_methods ELSE v_package_methods END,
      notes = CASE
        WHEN COALESCE(v_appt.notes, '') = '' OR lower(v_appt.notes) = lower(v_pkg.name)
          THEN COALESCE(v_service_name, 'Serviço da etapa não encontrado') || ' — ' || v_pkg.name
        ELSE v_appt.notes
      END,
      updated_at = now()
  WHERE id = _appointment_id;

  UPDATE public.service_packages sp
  SET sessions_scheduled = sub.scheduled_count, updated_at = now()
  FROM (
    SELECT package_id, count(*)::integer AS scheduled_count
    FROM public.package_appointments
    WHERE package_id = _package_id AND appointment_id IS NOT NULL AND status <> 'cancelled'
    GROUP BY package_id
  ) sub WHERE sp.id = sub.package_id;

  RETURN jsonb_build_object('packageAppointmentId', v_pa.id, 'sessionNumber', v_pa.session_number, 'totalSessions', v_pkg.total_sessions, 'serviceId', v_service_id, 'serviceName', v_service_name);
END;
$function$;

-- Reaplica a sincronização com a regra corrigida
SELECT public.repair_payment_integrity();