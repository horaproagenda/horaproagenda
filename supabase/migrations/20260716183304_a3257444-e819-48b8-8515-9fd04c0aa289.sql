
CREATE OR REPLACE FUNCTION public.delete_completed_or_cancelled_client_package(_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg public.service_packages%ROWTYPE;
  v_sale_ids uuid[] := ARRAY[]::uuid[];
  v_appointment_ids uuid[] := ARRAY[]::uuid[];
  v_total_sessions integer := 0;
  v_consumed_sessions integer := 0;
  v_is_cancelled boolean := false;
  v_can_delete boolean := false;
  v_deleted_appointments integer := 0;
BEGIN
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pacote não encontrado.');
  END IF;

  IF v_pkg.client_id IS NULL THEN
    RAISE EXCEPTION 'Apenas pacotes vinculados a clientes podem ser apagados por esta ação.';
  END IF;

  IF NOT public.can_access_service_package(_package_id) THEN
    RAISE EXCEPTION 'Acesso negado para apagar este pacote.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ss.id), ARRAY[]::uuid[])
    INTO v_sale_ids
  FROM public.single_sales ss
  WHERE ss.package_id = _package_id;

  SELECT COALESCE(array_agg(DISTINCT pa.appointment_id) FILTER (WHERE pa.appointment_id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_appointment_ids
  FROM public.package_appointments pa
  WHERE pa.package_id = _package_id;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE COALESCE(pa.status, 'pending') IN ('completed', 'missed'))::integer
    INTO v_total_sessions, v_consumed_sessions
  FROM public.package_appointments pa
  WHERE pa.package_id = _package_id;

  v_is_cancelled := v_pkg.is_active = false
    OR EXISTS (
      SELECT 1 FROM public.single_sales ss
      WHERE ss.package_id = _package_id AND COALESCE(ss.notes, '') ILIKE '%CANCELADO%'
    )
    OR EXISTS (
      SELECT 1 FROM public.cash_transactions ct
      WHERE ct.reference_type = 'package_refund'
        AND (ct.reference_id = _package_id OR ct.reference_id = ANY(v_sale_ids))
    );

  v_can_delete := v_is_cancelled OR (v_total_sessions > 0 AND v_consumed_sessions >= v_total_sessions);

  IF NOT v_can_delete THEN
    RAISE EXCEPTION 'Este pacote ainda possui aplicações em aberto. Cancele/devolva ou conclua todas as aplicações antes de apagar.';
  END IF;

  -- Financeiro/auditoria vinculados às vendas
  UPDATE public.cash_transactions
  SET reference_id = NULL
  WHERE reference_type = 'package_refund' AND reference_id = ANY(v_sale_ids);

  UPDATE public.client_credit_transactions SET sale_id = NULL WHERE sale_id = ANY(v_sale_ids);
  UPDATE public.payments_audit SET single_sale_id = NULL WHERE single_sale_id = ANY(v_sale_ids);
  UPDATE public.cash_register_entries SET single_sale_id = NULL WHERE single_sale_id = ANY(v_sale_ids);

  DELETE FROM public.boleto_installments WHERE sale_id = ANY(v_sale_ids);

  -- Lançamentos e transações de caixa gerados pelas vendas: apagar em cascata
  IF array_length(v_sale_ids, 1) > 0 THEN
    DELETE FROM public.financial_entries WHERE sale_id = ANY(v_sale_ids);
    DELETE FROM public.cash_transactions
      WHERE reference_type = 'single_sale' AND reference_id = ANY(v_sale_ids);
    UPDATE public.client_services SET sale_id = NULL WHERE sale_id = ANY(v_sale_ids);
  END IF;

  IF array_length(v_appointment_ids, 1) > 0 THEN
    UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(v_appointment_ids);
    DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(v_appointment_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(v_appointment_ids);
    DELETE FROM public.package_appointment_history WHERE appointment_id = ANY(v_appointment_ids);
    DELETE FROM public.appointments WHERE id = ANY(v_appointment_ids);
    GET DIAGNOSTICS v_deleted_appointments = ROW_COUNT;
  END IF;

  -- Apagar TODAS as vendas do pacote (independente de nota "CANCELADO")
  DELETE FROM public.single_sales WHERE id = ANY(v_sale_ids);

  DELETE FROM public.package_appointments WHERE package_id = _package_id;
  DELETE FROM public.service_packages WHERE id = _package_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
  VALUES (
    auth.uid(),
    'delete_completed_or_cancelled_package',
    'service_packages',
    _package_id,
    jsonb_build_object(
      'package_name', v_pkg.name,
      'client_id', v_pkg.client_id,
      'sale_ids', v_sale_ids,
      'appointment_ids_deleted', v_appointment_ids,
      'appointments_deleted_count', v_deleted_appointments,
      'cancelled', v_is_cancelled,
      'total_sessions', v_total_sessions,
      'consumed_sessions', v_consumed_sessions
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deletedPackageId', _package_id,
    'deletedAppointments', v_deleted_appointments,
    'deletedSales', COALESCE(array_length(v_sale_ids, 1), 0)
  );
END;
$function$;
