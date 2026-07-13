
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
  SELECT * INTO v_appointment FROM public.appointments WHERE id = _appointment_id;

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

  -- Restore paid client services to available so they can be re-scheduled
  UPDATE public.client_services
  SET appointment_id = NULL,
      status = 'available',
      used_at = NULL,
      updated_at = now()
  WHERE appointment_id = _appointment_id;

  DELETE FROM public.client_credit_transactions WHERE appointment_id = _appointment_id;

  IF v_had_package THEN
    SELECT package_id INTO v_package_id FROM public.package_appointments WHERE id = v_appointment.package_appointment_id;

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
    WHERE reference_id = _appointment_id AND COALESCE(reference_type, '') = 'appointment';
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
