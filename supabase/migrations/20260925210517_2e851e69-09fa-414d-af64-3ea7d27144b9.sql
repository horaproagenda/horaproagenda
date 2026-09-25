DROP FUNCTION IF EXISTS public.link_package_session_to_appointment(uuid, uuid);

CREATE OR REPLACE FUNCTION public.link_package_session_to_appointment(_package_id uuid, _appointment_id uuid, _package_appointment_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record; v_appt record; v_pa record;
  v_service_id uuid; v_service_name text;
  v_package_paid numeric := 0; v_package_methods text[] := ARRAY[]::text[];
  v_package_status text := 'pending'; v_sale_paid boolean := false; v_sale_amount numeric := 0;
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

  IF _package_appointment_id IS NOT NULL THEN
    -- Vínculo direto pelo ID único da etapa: nunca escolhe outra etapa.
    SELECT * INTO v_pa FROM public.package_appointments
    WHERE id = _package_appointment_id AND package_id = _package_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Etapa do pacote não encontrada'; END IF;
    IF v_pa.appointment_id IS NOT NULL AND v_pa.appointment_id <> _appointment_id THEN
      RAISE EXCEPTION 'Esta etapa do pacote já está agendada';
    END IF;
  ELSE
    SELECT * INTO v_pa FROM public.package_appointments
    WHERE package_id = _package_id
      AND (appointment_id = _appointment_id OR (appointment_id IS NULL AND status IN ('pending','scheduled','rescheduled')))
    ORDER BY
      CASE WHEN appointment_id = _appointment_id THEN 0 ELSE 1 END,
      COALESCE(original_session_number, sequence_order, session_number)
    LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Não há sessões disponíveis neste pacote'; END IF;
  END IF;

  v_service_id := COALESCE(v_pa.service_id, public.resolve_service_id_for_package(_package_id, COALESCE(v_pa.original_session_number, v_pa.sequence_order, v_pa.session_number)));
  SELECT name INTO v_service_name FROM public.services WHERE id = v_service_id;

  SELECT COALESCE(max(a.amount_paid), 0) INTO v_package_paid
  FROM public.package_appointments pa JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.package_id = _package_id;

  SELECT true, COALESCE(max(ss.final_amount), 0) INTO v_sale_paid, v_sale_amount
  FROM public.single_sales ss WHERE ss.package_id = _package_id AND ss.paid_at IS NOT NULL HAVING count(*) > 0;

  v_sale_paid := COALESCE(v_sale_paid, false);
  v_package_paid := GREATEST(COALESCE(v_package_paid, 0), COALESCE(v_sale_amount, 0));

  SELECT COALESCE(array_agg(DISTINCT method), ARRAY[]::text[]) INTO v_package_methods
  FROM (
    SELECT unnest(COALESCE(v_pkg.payment_methods, ARRAY[]::text[])) AS method
    UNION
    SELECT unnest(COALESCE(a.payment_methods, ARRAY[]::text[])) FROM public.package_appointments pa JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.package_id = _package_id
  ) methods WHERE method IS NOT NULL AND method <> '';

  v_package_status := CASE
    WHEN v_sale_paid THEN 'paid'
    WHEN COALESCE(v_pkg.total_price, 0) > 0 AND v_package_paid >= COALESCE(v_pkg.total_price, 0) THEN 'paid'
    WHEN v_package_paid > 0 THEN 'partial'
    ELSE 'pending' END;

  UPDATE public.package_appointments
  SET appointment_id = _appointment_id,
      status = CASE WHEN v_appt.status IN ('completed','missed','cancelled','rescheduled') THEN v_appt.status::text ELSE 'scheduled' END,
      scheduled_date = v_appt.start_time,
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
      notes = CASE WHEN COALESCE(v_appt.notes, '') = '' OR lower(v_appt.notes) = lower(v_pkg.name)
        THEN COALESCE(v_service_name, 'Serviço da etapa não encontrado') || ' — ' || v_pkg.name ELSE v_appt.notes END,
      updated_at = now()
  WHERE id = _appointment_id;

  UPDATE public.service_packages sp
  SET sessions_scheduled = sub.c, updated_at = now()
  FROM (SELECT package_id, count(*)::integer AS c FROM public.package_appointments
        WHERE package_id = _package_id AND appointment_id IS NOT NULL AND status <> 'cancelled' GROUP BY package_id) sub
  WHERE sp.id = sub.package_id;

  RETURN jsonb_build_object('packageAppointmentId', v_pa.id, 'sessionNumber', v_pa.session_number,
    'stepNumber', COALESCE(v_pa.original_session_number, v_pa.sequence_order, v_pa.session_number),
    'totalSessions', v_pkg.total_sessions, 'serviceId', v_service_id, 'serviceName', v_service_name);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.link_package_session_to_appointment(uuid, uuid, uuid) TO authenticated, service_role;