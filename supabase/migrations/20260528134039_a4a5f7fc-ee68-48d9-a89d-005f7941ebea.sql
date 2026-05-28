
-- Function: get pending/outstanding balance for a client
CREATE OR REPLACE FUNCTION public.get_client_outstanding_balance(_client_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT SUM(amount)::numeric
    FROM public.financial_entries
    WHERE client_id = _client_id
      AND status = 'pending'
      AND type IN ('income','receivable')
  ), 0)
  + COALESCE((
    SELECT SUM(bi.amount)::numeric
    FROM public.boleto_installments bi
    JOIN public.single_sales ss ON ss.id = bi.sale_id
    WHERE ss.client_id = _client_id
      AND bi.status NOT IN ('paid','cancelled')
  ), 0);
$$;

-- Function: force delete client and ALL related records
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
BEGIN
  IF NOT public.can_access_client_record(_client_id) THEN
    RAISE EXCEPTION 'Acesso negado para excluir este cliente';
  END IF;

  SELECT array_agg(id) INTO v_appt_ids FROM public.appointments WHERE client_id = _client_id;
  SELECT array_agg(id) INTO v_sale_ids FROM public.single_sales WHERE client_id = _client_id;
  SELECT array_agg(id) INTO v_pkg_ids  FROM public.service_packages WHERE client_id = _client_id;

  v_appt_ids := COALESCE(v_appt_ids, ARRAY[]::uuid[]);
  v_sale_ids := COALESCE(v_sale_ids, ARRAY[]::uuid[]);
  v_pkg_ids  := COALESCE(v_pkg_ids,  ARRAY[]::uuid[]);

  -- Cash transactions referenced by appointments/sales/packages
  DELETE FROM public.cash_transactions
   WHERE reference_id = ANY (v_appt_ids || v_sale_ids || v_pkg_ids);

  -- Boleto installments tied to sales
  IF array_length(v_sale_ids, 1) > 0 THEN
    DELETE FROM public.boleto_installments WHERE sale_id = ANY (v_sale_ids);
  END IF;

  -- Package appointments
  IF array_length(v_pkg_ids, 1) > 0 THEN
    DELETE FROM public.package_appointments WHERE package_id = ANY (v_pkg_ids);
  END IF;
  IF array_length(v_appt_ids, 1) > 0 THEN
    DELETE FROM public.package_appointments WHERE appointment_id = ANY (v_appt_ids);
  END IF;

  -- Credit transactions for this client
  DELETE FROM public.client_credit_transactions WHERE client_id = _client_id;

  -- Documents, photos, quotes, services, links
  DELETE FROM public.treatment_photos WHERE client_id = _client_id;
  DELETE FROM public.client_documents WHERE client_id = _client_id;
  DELETE FROM public.document_fill_links WHERE client_id = _client_id;
  DELETE FROM public.client_registration_links WHERE created_client_id = _client_id;
  DELETE FROM public.quotes WHERE client_id = _client_id;
  DELETE FROM public.client_services WHERE client_id = _client_id;

  -- Financial entries
  DELETE FROM public.financial_entries WHERE client_id = _client_id;

  -- Appointments, packages, sales
  DELETE FROM public.appointments WHERE client_id = _client_id;
  DELETE FROM public.service_packages WHERE client_id = _client_id;
  DELETE FROM public.single_sales WHERE client_id = _client_id;

  -- Finally the client
  DELETE FROM public.clients WHERE id = _client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_outstanding_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_client(uuid) TO authenticated;
