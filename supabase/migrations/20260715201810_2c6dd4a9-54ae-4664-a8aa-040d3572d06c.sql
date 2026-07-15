
-- Torna o FK de financial_entries.appointment_id compatível com exclusão
-- de agendamento (o pagamento permanece no financeiro, apenas perde o vínculo).
ALTER TABLE public.financial_entries DROP CONSTRAINT IF EXISTS financial_entries_appointment_id_fkey;
ALTER TABLE public.financial_entries
  ADD CONSTRAINT financial_entries_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

-- delete_appointment_cascade: quando o agendamento pertence a um pacote,
-- desvincula (em vez de excluir) as financial_entries e cash_transactions
-- para preservar o histórico financeiro do pacote e evitar erros de FK.
CREATE OR REPLACE FUNCTION public.delete_appointment_cascade(_appointment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  UPDATE public.whatsapp_send_queue SET appointment_id = NULL WHERE appointment_id = _appointment_id;

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

    -- Preserva o histórico financeiro do pacote, mas remove o vínculo com o agendamento excluído.
    UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = _appointment_id;
    UPDATE public.cash_transactions
      SET reference_id = NULL, reference_type = NULL
      WHERE reference_id = _appointment_id AND COALESCE(reference_type, '') = 'appointment';
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
$function$;
