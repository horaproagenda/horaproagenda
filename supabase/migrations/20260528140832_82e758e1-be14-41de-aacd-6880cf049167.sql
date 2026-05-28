DROP FUNCTION IF EXISTS public.force_delete_client(uuid);

CREATE OR REPLACE FUNCTION public.force_delete_client(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt_ids uuid[];
  v_sale_ids uuid[];
  v_pkg_ids uuid[];
  v_pkg_appt_ids uuid[];
  v_boleto_ids uuid[];
  v_counts jsonb;
BEGIN
  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Acesso negado para excluir este cliente';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_appt_ids FROM public.appointments WHERE client_id = _client_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_sale_ids FROM public.single_sales WHERE client_id = _client_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_pkg_ids FROM public.service_packages WHERE client_id = _client_id;
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_pkg_appt_ids FROM public.package_appointments WHERE package_id = ANY(v_pkg_ids);
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_boleto_ids FROM public.boleto_installments WHERE sale_id = ANY(v_sale_ids);

  v_counts := jsonb_build_object(
    'appointments', COALESCE(array_length(v_appt_ids,1),0),
    'sales', COALESCE(array_length(v_sale_ids,1),0),
    'packages', COALESCE(array_length(v_pkg_ids,1),0),
    'photos', (SELECT COUNT(*) FROM public.treatment_photos WHERE client_id = _client_id),
    'documents', (SELECT COUNT(*) FROM public.client_documents WHERE client_id = _client_id)
  );

  IF array_length(v_appt_ids, 1) > 0 THEN
    DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(v_appt_ids);
    UPDATE public.product_daily_consumption SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
    UPDATE public.treatment_photos SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
    UPDATE public.client_services SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.client_credit_transactions WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.financial_entries WHERE appointment_id = ANY(v_appt_ids);
    DELETE FROM public.cash_transactions WHERE reference_id = ANY(v_appt_ids);
    UPDATE public.package_appointments SET appointment_id = NULL WHERE appointment_id = ANY(v_appt_ids);
  END IF;

  IF array_length(v_pkg_appt_ids, 1) > 0 THEN
    DELETE FROM public.package_appointment_history WHERE package_appointment_id = ANY(v_pkg_appt_ids);
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

  RETURN jsonb_build_object('deleted', true, 'counts', v_counts);
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_delete_client(uuid) TO authenticated;