CREATE OR REPLACE FUNCTION public.process_package_session_operation(
  p_package_id uuid,
  p_session_number integer,
  p_action text,
  p_idempotency_key text,
  p_request_id uuid,
  p_reason text,
  p_origin text DEFAULT 'ui',
  p_code_version text DEFAULT 'unknown',
  p_start_time timestamptz DEFAULT NULL,
  p_end_time timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing jsonb; v_pkg service_packages%ROWTYPE; v_pa package_appointments%ROWTYPE;
  v_prev jsonb; v_new jsonb; v_result jsonb; v_appt_start timestamptz; v_appt_end timestamptz;
BEGIN
  IF auth.uid() IS NULL AND p_origin = 'ui' THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'Operação sem identificador.' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Informe o motivo da alteração.' USING ERRCODE = '22023';
  END IF;
  IF p_action NOT IN ('reschedule','complete','cancel','reopen') THEN
    RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT result INTO v_existing FROM package_audit_logs WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing || jsonb_build_object('replayed', true); END IF;

  SELECT * INTO v_pkg FROM service_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF auth.uid() IS NOT NULL AND (v_pkg.account_owner_id <> current_account_owner_id() OR NOT can_access_service_package(p_package_id)) THEN
    RAISE EXCEPTION 'Sem permissão para este pacote.' USING ERRCODE = '42501';
  END IF;

  SELECT result INTO v_existing FROM package_audit_logs WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing || jsonb_build_object('replayed', true); END IF;

  SELECT * INTO v_pa FROM package_appointments
   WHERE package_id = p_package_id AND session_number = p_session_number
     AND status NOT IN ('cancelled','rescheduled')
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sessão não encontrada neste pacote.' USING ERRCODE = 'P0002'; END IF;

  v_prev := to_jsonb(v_pa);
  IF v_pa.appointment_id IS NOT NULL THEN
    SELECT start_time, end_time INTO v_appt_start, v_appt_end FROM appointments WHERE id = v_pa.appointment_id FOR UPDATE;
    v_prev := v_prev || jsonb_build_object('appointment_start', v_appt_start, 'appointment_end', v_appt_end);
  END IF;

  IF p_action = 'reschedule' THEN
    IF NOT v_pkg.is_active THEN RAISE EXCEPTION 'Pacote encerrado não pode receber novos agendamentos.' USING ERRCODE='23514'; END IF;
    IF v_pa.status = 'completed' THEN RAISE EXCEPTION 'Sessão concluída não pode ser remarcada.' USING ERRCODE='23514'; END IF;
    IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
      RAISE EXCEPTION 'Horário inválido.' USING ERRCODE='22023';
    END IF;
    IF v_pa.appointment_id IS NULL THEN
      RAISE EXCEPTION 'Sessão ainda sem agendamento; agende pela agenda.' USING ERRCODE='23514';
    END IF;
    UPDATE appointments SET start_time = p_start_time, end_time = p_end_time, updated_by = auth.uid()
     WHERE id = v_pa.appointment_id;
    UPDATE package_appointments SET scheduled_date = p_start_time WHERE id = v_pa.id;
  ELSIF p_action = 'complete' THEN
    IF v_pa.appointment_id IS NOT NULL THEN
      UPDATE appointments SET status = 'completed', updated_by = auth.uid()
       WHERE id = v_pa.appointment_id AND status <> 'completed';
    END IF;
    UPDATE package_appointments SET status = 'completed' WHERE id = v_pa.id AND status <> 'completed';
  ELSIF p_action = 'cancel' THEN
    IF v_pa.status = 'completed' THEN RAISE EXCEPTION 'Sessão concluída não pode ser cancelada; reabra antes com motivo.' USING ERRCODE='23514'; END IF;
    UPDATE package_appointments SET status = 'pending', appointment_id = NULL, scheduled_date = NULL WHERE id = v_pa.id;
    IF v_pa.appointment_id IS NOT NULL THEN
      UPDATE appointments SET status = 'cancelled', updated_by = auth.uid() WHERE id = v_pa.appointment_id;
    END IF;
  ELSIF p_action = 'reopen' THEN
    IF v_pa.status <> 'completed' THEN RAISE EXCEPTION 'Somente sessões concluídas podem ser reabertas.' USING ERRCODE='23514'; END IF;
    PERFORM set_config('app.package_reopen_reason', p_reason, true);
    IF v_pa.appointment_id IS NOT NULL THEN
      UPDATE appointments SET status = 'scheduled', updated_by = auth.uid() WHERE id = v_pa.appointment_id;
    END IF;
    UPDATE package_appointments SET status = CASE WHEN appointment_id IS NULL THEN 'pending' ELSE 'scheduled' END WHERE id = v_pa.id;
    PERFORM set_config('app.package_reopen_reason', '', true);
  END IF;

  SELECT to_jsonb(pa.*) INTO v_new FROM package_appointments pa WHERE pa.id = v_pa.id;
  v_result := jsonb_build_object('ok', true, 'package_appointment_id', v_pa.id, 'status', v_new->>'status', 'replayed', false);

  INSERT INTO package_audit_logs(account_owner_id, package_id, package_appointment_id, appointment_id, session_number,
    action, previous_state, new_state, actor_id, origin, request_id, idempotency_key, code_version, reason, result)
  VALUES (v_pkg.account_owner_id, p_package_id, v_pa.id, v_pa.appointment_id, p_session_number,
    p_action, v_prev, v_new, auth.uid(), p_origin, p_request_id, p_idempotency_key, p_code_version, p_reason, v_result);

  RETURN v_result;
END $$;