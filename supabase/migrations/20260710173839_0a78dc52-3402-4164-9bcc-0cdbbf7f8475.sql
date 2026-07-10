CREATE OR REPLACE FUNCTION public.purge_single_sale_cascade(_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sale RECORD;
  _result jsonb := jsonb_build_object();
  _deleted_appointments int := 0;
  _deleted_package_appts int := 0;
  _deleted_package int := 0;
  _deleted_client_services int := 0;
  _deleted_financial int := 0;
  _deleted_cash int := 0;
  _deleted_boletos int := 0;
  _pkg_id uuid;
BEGIN
  SELECT * INTO _sale FROM public.single_sales WHERE id = _sale_id;
  IF _sale.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sale_not_found');
  END IF;

  IF auth.uid() IS NOT NULL
     AND _sale.account_owner_id IS NOT NULL
     AND _sale.account_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  _pkg_id := _sale.package_id;

  IF _sale.item_type = 'package' AND _pkg_id IS NOT NULL THEN
    WITH del AS (
      DELETE FROM public.appointments
      WHERE package_appointment_id IN (
        SELECT id FROM public.package_appointments WHERE package_id = _pkg_id
      )
      RETURNING 1
    ) SELECT count(*) INTO _deleted_appointments FROM del;

    WITH del AS (
      DELETE FROM public.package_appointments WHERE package_id = _pkg_id
      RETURNING 1
    ) SELECT count(*) INTO _deleted_package_appts FROM del;
  END IF;

  WITH del AS (
    DELETE FROM public.client_services WHERE sale_id = _sale_id RETURNING 1
  ) SELECT count(*) INTO _deleted_client_services FROM del;

  WITH del AS (
    DELETE FROM public.financial_entries WHERE sale_id = _sale_id RETURNING 1
  ) SELECT count(*) INTO _deleted_financial FROM del;

  WITH del AS (
    DELETE FROM public.cash_transactions
    WHERE reference_type = 'single_sale' AND reference_id = _sale_id
    RETURNING 1
  ) SELECT count(*) INTO _deleted_cash FROM del;

  WITH del AS (
    DELETE FROM public.boleto_installments WHERE sale_id = _sale_id RETURNING 1
  ) SELECT count(*) INTO _deleted_boletos FROM del;

  -- Delete the sale FIRST so the FK single_sales.package_id no longer references the package
  DELETE FROM public.single_sales WHERE id = _sale_id;

  -- Now safe to delete the package if no other sale references it
  IF _pkg_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.single_sales WHERE package_id = _pkg_id
  ) THEN
    WITH del AS (
      DELETE FROM public.service_packages WHERE id = _pkg_id RETURNING 1
    ) SELECT count(*) INTO _deleted_package FROM del;
  END IF;

  _result := jsonb_build_object(
    'ok', true,
    'sale_id', _sale_id,
    'deleted_appointments', _deleted_appointments,
    'deleted_package_appointments', _deleted_package_appts,
    'deleted_service_package', _deleted_package,
    'deleted_client_services', _deleted_client_services,
    'deleted_financial_entries', _deleted_financial,
    'deleted_cash_transactions', _deleted_cash,
    'deleted_boleto_installments', _deleted_boletos
  );
  RETURN _result;
END;
$function$;