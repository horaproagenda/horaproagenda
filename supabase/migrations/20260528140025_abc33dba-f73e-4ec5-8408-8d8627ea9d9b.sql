CREATE OR REPLACE FUNCTION public.delete_appointment_cascade(_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_package_id uuid;
  v_had_package boolean := false;
  v_had_payment boolean := false;
  v_amount numeric := 0;
BEGIN
  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = _appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  IF NOT public.can_access_appointment(_appointment_id) THEN
    RAISE EXCEPTION 'Acesso negado para excluir este agendamento';
  END IF;

  v_had_package := v_appointment.package_appointment_id IS NOT NULL;
  v_had_payment := COALESCE(v_appointment.amount_paid, 0) > 0;
  v_amount := COALESCE(v_appointment.amount_paid, 0);

  DELETE FROM public.appointment_edit_locks WHERE appointment_id = _appointment_id;
  DELETE FROM public.appointment_reminder_log WHERE appointment_id = _appointment_id;
  DELETE FROM public.appointment_additional_items WHERE appointment_id = _appointment_id;
  DELETE FROM public.appointment_product_consumption WHERE appointment_id = _appointment_id;
  UPDATE public.product_daily_consumption SET appointment_id = NULL WHERE appointment_id = _appointment_id;
  UPDATE public.treatment_photos SET appointment_id = NULL WHERE appointment_id = _appointment_id;
  UPDATE public.client_services SET appointment_id = NULL WHERE appointment_id = _appointment_id;
  DELETE FROM public.client_credit_transactions WHERE appointment_id = _appointment_id;

  IF v_had_package THEN
    SELECT package_id INTO v_package_id
    FROM public.package_appointments
    WHERE id = v_appointment.package_appointment_id;

    UPDATE public.package_appointments
    SET appointment_id = NULL,
        scheduled_date = NULL,
        status = 'pending',
        updated_at = now()
    WHERE id = v_appointment.package_appointment_id;

    IF v_package_id IS NOT NULL THEN
      UPDATE public.service_packages
      SET sessions_scheduled = GREATEST(COALESCE(sessions_scheduled, 0) - 1, 0),
          updated_at = now()
      WHERE id = v_package_id;
    END IF;
  ELSE
    DELETE FROM public.financial_entries WHERE appointment_id = _appointment_id;
    DELETE FROM public.cash_transactions
    WHERE reference_id = _appointment_id
      AND COALESCE(reference_type, '') = 'appointment';
  END IF;

  DELETE FROM public.appointments WHERE id = _appointment_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'hadPackageSession', v_had_package,
    'hadPayment', v_had_payment,
    'amountDeleted', v_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_appointment_cascade(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_client_registration_only(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Acesso negado para excluir este cliente';
  END IF;

  IF EXISTS (SELECT 1 FROM public.appointments WHERE client_id = _client_id)
     OR EXISTS (SELECT 1 FROM public.service_packages WHERE client_id = _client_id)
     OR EXISTS (SELECT 1 FROM public.single_sales WHERE client_id = _client_id)
     OR EXISTS (SELECT 1 FROM public.financial_entries WHERE client_id = _client_id)
     OR EXISTS (SELECT 1 FROM public.client_credit_transactions WHERE client_id = _client_id)
  THEN
    RAISE EXCEPTION 'Este cliente possui histórico operacional. Use "Excluir cliente e TODOS os registros" para apagar cadastro, agenda, pacotes e financeiro.';
  END IF;

  UPDATE public.document_fill_links SET client_id = NULL WHERE client_id = _client_id;
  UPDATE public.client_registration_links SET created_client_id = NULL WHERE created_client_id = _client_id;
  DELETE FROM public.treatment_photos WHERE client_id = _client_id;
  DELETE FROM public.client_documents WHERE client_id = _client_id;
  DELETE FROM public.quotes WHERE client_id = _client_id;
  DELETE FROM public.client_services WHERE client_id = _client_id;
  DELETE FROM public.clients WHERE id = _client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_registration_only(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.force_delete_client(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt_ids uuid[];
  v_sale_ids uuid[];
  v_pkg_ids uuid[];
  v_boleto_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir cliente e todos os registros';
  END IF;

  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Acesso negado para excluir este cliente';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_appt_ids FROM public.appointments WHERE client_id = _client_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_sale_ids FROM public.single_sales WHERE client_id = _client_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_pkg_ids FROM public.service_packages WHERE client_id = _client_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
    INTO v_boleto_ids
  FROM public.boleto_installments
  WHERE sale_id = ANY(v_sale_ids);

  IF array_length(v_appt_ids, 1) > 0 THEN
    DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(v_appt_ids);
    UPDATE public.product_daily_consumption SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
    UPDATE public.treatment_photos SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
    UPDATE public.client_services SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.financial_entries WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.cash_transactions WHERE reference_id = ANY(v_appt_ids);
  END IF;

  IF array_length(v_boleto_ids, 1) > 0 THEN
    UPDATE public.boleto_audit_log SET boleto_installment_id = NULL WHERE boleto_installment_id = ANY(v_boleto_ids);
  END IF;

  IF array_length(v_sale_ids, 1) > 0 THEN
    DELETE FROM public.cash_register_entries WHERE single_sale_id = ANY(v_sale_ids);
    DELETE FROM public.payments_audit WHERE single_sale_id = ANY(v_sale_ids);
    DELETE FROM public.client_credit_transactions WHERE sale_id = ANY(v_sale_ids);
    UPDATE public.client_services SET sale_id = NULL WHERE sale_id = ANY(v_sale_ids);
    DELETE FROM public.boleto_installments WHERE sale_id = ANY(v_sale_ids);
    DELETE FROM public.cash_transactions WHERE reference_id = ANY(v_sale_ids);
  END IF;

  IF array_length(v_pkg_ids, 1) > 0 THEN
    DELETE FROM public.cash_transactions WHERE reference_id = ANY(v_pkg_ids);
    DELETE FROM public.package_appointments WHERE package_id = ANY(v_pkg_ids);
    DELETE FROM public.single_sales WHERE package_id = ANY(v_pkg_ids);
  END IF;

  DELETE FROM public.client_credit_transactions WHERE client_id = _client_id;
  DELETE FROM public.cash_register_entries WHERE client_id = _client_id;
  DELETE FROM public.payments_audit WHERE client_id = _client_id;
  DELETE FROM public.whatsapp_queue WHERE client_id = _client_id;
  DELETE FROM public.financial_entries WHERE client_id = _client_id;

  UPDATE public.document_fill_links SET client_id = NULL WHERE client_id = _client_id;
  UPDATE public.client_registration_links SET created_client_id = NULL WHERE created_client_id = _client_id;
  DELETE FROM public.treatment_photos WHERE client_id = _client_id;
  DELETE FROM public.client_documents WHERE client_id = _client_id;
  DELETE FROM public.quotes WHERE client_id = _client_id;
  DELETE FROM public.client_services WHERE client_id = _client_id;

  DELETE FROM public.appointments WHERE client_id = _client_id;
  DELETE FROM public.single_sales WHERE client_id = _client_id;
  DELETE FROM public.service_packages WHERE client_id = _client_id;
  DELETE FROM public.clients WHERE id = _client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_delete_client(uuid) TO authenticated;