-- 1. Etapas autônomas
ALTER TABLE public.package_template_steps
  ALTER COLUMN service_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS step_name text,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS default_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_equipment text[] NOT NULL DEFAULT '{}';

UPDATE public.package_template_steps s
   SET step_name = COALESCE(s.step_name, sv.name),
       duration_minutes = COALESCE(s.duration_minutes, sv.duration)
  FROM public.services sv
 WHERE sv.id = s.service_id AND (s.step_name IS NULL OR s.duration_minutes IS NULL);

CREATE OR REPLACE FUNCTION public.validate_package_template_step()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.service_id IS NULL AND (NEW.step_name IS NULL OR btrim(NEW.step_name) = '') THEN
    RAISE EXCEPTION 'Informe o nome da etapa.' USING ERRCODE = '23514';
  END IF;
  IF NEW.duration_minutes IS NOT NULL AND (NEW.duration_minutes < 5 OR NEW.duration_minutes > 1440) THEN
    RAISE EXCEPTION 'Duração da etapa inválida.' USING ERRCODE = '23514';
  END IF;
  IF NEW.sequence_order < 1 THEN
    RAISE EXCEPTION 'Ordem da etapa inválida.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_package_template_step ON public.package_template_steps;
CREATE TRIGGER trg_validate_package_template_step BEFORE INSERT OR UPDATE ON public.package_template_steps
FOR EACH ROW EXECUTE FUNCTION public.validate_package_template_step();

-- 2. Auditoria idempotente
CREATE TABLE IF NOT EXISTS public.package_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_owner_id uuid NOT NULL,
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  package_appointment_id uuid,
  appointment_id uuid,
  session_number integer,
  action text NOT NULL,
  previous_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  origin text NOT NULL CHECK (origin IN ('ui','webhook','cron','api','migration')),
  request_id uuid NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  code_version text NOT NULL DEFAULT 'unknown',
  reason text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.package_audit_logs TO authenticated;
GRANT ALL ON public.package_audit_logs TO service_role;
ALTER TABLE public.package_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Package audit visible to package viewers" ON public.package_audit_logs
  FOR SELECT TO authenticated
  USING (account_owner_id = public.current_account_owner_id() AND public.can_access_service_package(package_id));
CREATE INDEX IF NOT EXISTS idx_package_audit_logs_pkg ON public.package_audit_logs(package_id, session_number, created_at DESC);

-- 3. Invariantes estruturais
CREATE UNIQUE INDEX IF NOT EXISTS ux_package_appointments_active_session
  ON public.package_appointments(package_id, session_number)
  WHERE status NOT IN ('cancelled','rescheduled');

CREATE OR REPLACE FUNCTION public.guard_package_session_invariants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_active int; v_is_active boolean;
BEGIN
  IF NEW.session_number < 1 THEN
    RAISE EXCEPTION 'Número de sessão inválido.' USING ERRCODE = '23514';
  END IF;
  SELECT total_sessions, is_active INTO v_total, v_is_active FROM service_packages WHERE id = NEW.package_id;
  IF NEW.status NOT IN ('cancelled','rescheduled') THEN
    SELECT count(*) INTO v_active FROM package_appointments
     WHERE package_id = NEW.package_id AND status NOT IN ('cancelled','rescheduled') AND id <> NEW.id;
    IF v_active + 1 > v_total THEN
      RAISE EXCEPTION 'O pacote já possui todas as % sessões contratadas.', v_total USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'completed' AND NEW.status = 'pending'
       AND coalesce(current_setting('app.package_reopen_reason', true), '') = '' THEN
      RAISE EXCEPTION 'Sessão concluída só pode ser reaberta com motivo registrado.' USING ERRCODE = '23514';
    END IF;
    IF NOT v_is_active AND NEW.status = 'scheduled' AND OLD.status IS DISTINCT FROM 'scheduled' THEN
      RAISE EXCEPTION 'Pacote encerrado não pode receber novos agendamentos.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_package_session_invariants ON public.package_appointments;
CREATE TRIGGER trg_guard_package_session_invariants BEFORE INSERT OR UPDATE OF status, session_number, package_id
ON public.package_appointments FOR EACH ROW EXECUTE FUNCTION public.guard_package_session_invariants();

-- 4. Operação única e atômica
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

  -- recheck after lock (concorrência)
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
    -- somente esta sessão; nenhuma outra é movida
    UPDATE appointments SET start_time = p_start_time, end_time = p_end_time, updated_by = auth.uid()
     WHERE id = v_pa.appointment_id;
    UPDATE package_appointments SET scheduled_date = p_start_time WHERE id = v_pa.id;
  ELSIF p_action = 'complete' THEN
    IF v_pa.status = 'completed' THEN
      NULL; -- já concluída: idempotente
    ELSE
      UPDATE package_appointments SET status = 'completed' WHERE id = v_pa.id;
    END IF;
  ELSIF p_action = 'cancel' THEN
    IF v_pa.status = 'completed' THEN RAISE EXCEPTION 'Sessão concluída não pode ser cancelada; reabra antes com motivo.' USING ERRCODE='23514'; END IF;
    UPDATE package_appointments SET status = 'pending', appointment_id = NULL, scheduled_date = NULL WHERE id = v_pa.id;
    IF v_pa.appointment_id IS NOT NULL THEN
      UPDATE appointments SET status = 'cancelled', updated_by = auth.uid() WHERE id = v_pa.appointment_id;
    END IF;
  ELSIF p_action = 'reopen' THEN
    IF v_pa.status <> 'completed' THEN RAISE EXCEPTION 'Somente sessões concluídas podem ser reabertas.' USING ERRCODE='23514'; END IF;
    PERFORM set_config('app.package_reopen_reason', p_reason, true);
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

REVOKE ALL ON FUNCTION public.process_package_session_operation(uuid,integer,text,text,uuid,text,text,text,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_package_session_operation(uuid,integer,text,text,uuid,text,text,text,timestamptz,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_package_session_invariants() FROM PUBLIC, anon, authenticated;