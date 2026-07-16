CREATE OR REPLACE FUNCTION public.heal_orphan_service_packages()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := auth.uid();
  _pkg RECORD;
  _appt_ids uuid[];
  _deleted_packages int := 0;
  _package_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR _pkg IN
    SELECT p.id
    FROM public.service_packages p
    WHERE p.client_id IS NOT NULL
      AND (p.account_owner_id = _owner OR _owner IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.package_id = p.id)
  LOOP
    SELECT COALESCE(array_agg(DISTINCT pa.appointment_id) FILTER (WHERE pa.appointment_id IS NOT NULL), ARRAY[]::uuid[])
      INTO _appt_ids
    FROM public.package_appointments pa
    WHERE pa.package_id = _pkg.id;

    IF array_length(_appt_ids, 1) > 0 THEN
      UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
      DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(_appt_ids);
      DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_appt_ids);
      DELETE FROM public.package_appointment_history WHERE appointment_id = ANY(_appt_ids);
      DELETE FROM public.appointments WHERE id = ANY(_appt_ids);
    END IF;

    DELETE FROM public.package_appointments WHERE package_id = _pkg.id;
    DELETE FROM public.service_packages WHERE id = _pkg.id;
    _deleted_packages := _deleted_packages + 1;
    _package_ids := _package_ids || _pkg.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_packages', _deleted_packages,
    'package_ids', to_jsonb(_package_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.heal_orphan_service_packages() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_sale_flow_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := auth.uid();
  _result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'sales_with_boleto_no_installments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'client_id', s.client_id, 'final_amount', s.final_amount, 'sale_date', s.sale_date))
      FROM public.single_sales s
      JOIN public.payment_methods pm ON pm.id = s.payment_method_id
      WHERE (s.account_owner_id = _owner OR _owner IS NULL)
        AND pm.name ILIKE '%boleto%'
        AND NOT EXISTS (SELECT 1 FROM public.boleto_installments bi WHERE bi.sale_id = s.id)
    ), '[]'::jsonb),
    'packages_without_active_sale', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'client_id', p.client_id))
      FROM public.service_packages p
      WHERE (p.account_owner_id = _owner OR _owner IS NULL)
        AND p.client_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.package_id = p.id)
    ), '[]'::jsonb),
    'client_services_without_sale', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cs.id, 'client_id', cs.client_id, 'service_id', cs.service_id))
      FROM public.client_services cs
      WHERE (cs.account_owner_id = _owner OR _owner IS NULL)
        AND cs.sale_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.id = cs.sale_id)
    ), '[]'::jsonb),
    'financial_entries_without_sale', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', fe.id, 'description', fe.description, 'amount', fe.amount))
      FROM public.financial_entries fe
      WHERE (fe.account_owner_id = _owner OR _owner IS NULL)
        AND fe.sale_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.single_sales s WHERE s.id = fe.sale_id)
    ), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_purge_package_on_sale_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appt_ids uuid[];
BEGIN
  IF OLD.package_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.single_sales WHERE package_id = OLD.package_id AND id <> OLD.id) THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT pa.appointment_id) FILTER (WHERE pa.appointment_id IS NOT NULL), ARRAY[]::uuid[])
    INTO _appt_ids
  FROM public.package_appointments pa
  WHERE pa.package_id = OLD.package_id;

  IF array_length(_appt_ids, 1) > 0 THEN
    UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.package_appointment_history WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointments WHERE id = ANY(_appt_ids);
  END IF;

  DELETE FROM public.package_appointments WHERE package_id = OLD.package_id;
  DELETE FROM public.service_packages WHERE id = OLD.package_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_package_on_sale_delete ON public.single_sales;
CREATE TRIGGER trg_purge_package_on_sale_delete
AFTER DELETE ON public.single_sales
FOR EACH ROW EXECUTE FUNCTION public.tg_purge_package_on_sale_delete();

SELECT public.heal_orphan_service_packages();