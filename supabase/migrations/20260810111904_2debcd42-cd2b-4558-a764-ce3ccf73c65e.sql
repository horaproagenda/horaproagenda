-- 1) Equipamento por agendamento
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_equipment_time
  ON public.appointments (equipment_id, start_time)
  WHERE equipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_room_time
  ON public.appointments (room_id, start_time)
  WHERE room_id IS NOT NULL;

-- 2) Motivo de conflito em português claro (profissional, sala, equipamento, ausência)
CREATE OR REPLACE FUNCTION public.appointment_conflict_reason(
  p_id uuid,
  p_professional_id uuid,
  p_room_id uuid,
  p_equipment_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_skip_package uuid;
  v_when text;
  v_row record;
BEGIN
  IF p_status IN ('cancelled','missed','rescheduled') THEN RETURN NULL; END IF;
  IF p_start IS NULL OR p_end IS NULL THEN RETURN NULL; END IF;

  BEGIN
    v_skip_package := NULLIF(current_setting('app.reschedule_package_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_skip_package := NULL;
  END;

  -- Profissional
  IF p_professional_id IS NOT NULL THEN
    SELECT a.start_time, a.end_time INTO v_row
    FROM public.appointments a
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    WHERE a.professional_id = p_professional_id
      AND a.status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
      AND (p_id IS NULL OR a.id <> p_id)
      AND a.start_time < p_end
      AND a.end_time   > p_start
      AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
    LIMIT 1;
    IF FOUND THEN
      v_when := to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
        || ' das ' || to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
        || ' às ' || to_char(v_row.end_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
      RETURN 'O profissional já tem outro atendimento em ' || v_when || '. Escolha outro horário ou outro profissional.';
    END IF;
  END IF;

  -- Sala
  IF p_room_id IS NOT NULL THEN
    SELECT a.start_time, a.end_time INTO v_row
    FROM public.appointments a
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    WHERE a.room_id = p_room_id
      AND a.status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
      AND (p_id IS NULL OR a.id <> p_id)
      AND a.start_time < p_end
      AND a.end_time   > p_start
      AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
    LIMIT 1;
    IF FOUND THEN
      v_when := to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
        || ' das ' || to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
        || ' às ' || to_char(v_row.end_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
      RETURN 'A sala escolhida já está ocupada em ' || v_when || '. Escolha outra sala ou outro horário.';
    END IF;
  END IF;

  -- Equipamento
  IF p_equipment_id IS NOT NULL THEN
    SELECT a.start_time, a.end_time INTO v_row
    FROM public.appointments a
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    WHERE a.equipment_id = p_equipment_id
      AND a.status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
      AND (p_id IS NULL OR a.id <> p_id)
      AND a.start_time < p_end
      AND a.end_time   > p_start
      AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
    LIMIT 1;
    IF FOUND THEN
      v_when := to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
        || ' das ' || to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
        || ' às ' || to_char(v_row.end_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');
      RETURN 'O equipamento escolhido já está em uso em ' || v_when || '. Escolha outro equipamento ou outro horário.';
    END IF;
  END IF;

  -- Ausência do profissional
  IF p_professional_id IS NOT NULL THEN
    SELECT ab.start_time, ab.end_time INTO v_row
    FROM public.professional_absences ab
    WHERE ab.professional_id = p_professional_id
      AND ab.start_time < p_end
      AND ab.end_time   > p_start
    LIMIT 1;
    IF FOUND THEN
      v_when := to_char(v_row.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
      RETURN 'O profissional está ausente em ' || v_when || '. Escolha outra data ou outro profissional.';
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

-- Mantém a assinatura antiga funcionando (profissional + ausências)
CREATE OR REPLACE FUNCTION public.appointment_has_conflict(
  p_id uuid,
  p_professional_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_status text
)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.appointment_conflict_reason(p_id, p_professional_id, NULL, NULL, p_start, p_end, p_status);
$function$;

-- 3) Trigger de bloqueio: mensagem clara e checagem de sala/equipamento
CREATE OR REPLACE FUNCTION public.tg_block_appointment_conflicts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_msg text;
BEGIN
  v_msg := public.appointment_conflict_reason(
    NEW.id, NEW.professional_id, NEW.room_id, NEW.equipment_id,
    NEW.start_time, NEW.end_time, NEW.status::text
  );
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%', v_msg USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_appointment_conflicts ON public.appointments;
CREATE TRIGGER trg_block_appointment_conflicts
  BEFORE INSERT OR UPDATE OF start_time, end_time, professional_id, room_id, equipment_id, status
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_appointment_conflicts();

-- 4) Reagendamento de sessão de pacote: aplica só o que mudou, sem cascata
DROP FUNCTION IF EXISTS public.reschedule_package_appointment_safely(uuid, timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.reschedule_package_appointment_safely(
  p_appointment_id uuid,
  p_new_start timestamptz DEFAULT NULL,
  p_new_end timestamptz DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_field_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_appt public.appointments;
  v_updated public.appointments;
  v_package_id uuid;
  v_pa_id uuid;
  v_pkg_service_id uuid;
  v_package_name text;
  v_service_name text;
  v_conflict text;
  v_start timestamptz;
  v_end timestamptz;
  v_prof uuid;
  v_room uuid;
  v_equip uuid;
  v_service uuid;
  v_notes text;
  v_fields jsonb := COALESCE(p_field_updates, '{}'::jsonb);
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um agendamento válido para alterar.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND account_owner_id = public.get_user_account_owner_id(auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão para alteração.' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_version IS NOT NULL AND v_appt.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Este agendamento foi atualizado em outro dispositivo. Atualize a agenda e tente novamente.' USING ERRCODE = 'P0001';
  END IF;

  -- Só os campos enviados são alterados; os demais permanecem como estão.
  v_start := COALESCE(p_new_start, v_appt.start_time);
  v_end   := COALESCE(p_new_end, v_appt.end_time);
  IF v_end <= v_start THEN
    RAISE EXCEPTION 'O horário de término deve ser depois do horário de início.' USING ERRCODE = 'P0001';
  END IF;

  v_prof := CASE WHEN v_fields ? 'professional_id'
    THEN NULLIF(v_fields->>'professional_id','')::uuid ELSE v_appt.professional_id END;
  v_room := CASE WHEN v_fields ? 'room_id'
    THEN NULLIF(v_fields->>'room_id','')::uuid ELSE v_appt.room_id END;
  v_equip := CASE WHEN v_fields ? 'equipment_id'
    THEN NULLIF(v_fields->>'equipment_id','')::uuid ELSE v_appt.equipment_id END;
  v_service := CASE WHEN v_fields ? 'service_id'
    THEN COALESCE(NULLIF(v_fields->>'service_id','')::uuid, v_appt.service_id) ELSE v_appt.service_id END;
  v_notes := CASE WHEN v_fields ? 'notes' THEN v_fields->>'notes' ELSE v_appt.notes END;

  IF v_appt.package_appointment_id IS NOT NULL THEN
    SELECT pa.id, pa.package_id, COALESCE(pa.service_id, v_service, sp.service_id), sp.name, svc.name
      INTO v_pa_id, v_package_id, v_pkg_service_id, v_package_name, v_service_name
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, v_service, sp.service_id)
    WHERE pa.id = v_appt.package_appointment_id
      AND pa.account_owner_id = v_appt.account_owner_id;
  END IF;

  -- Ignora as próprias sessões do pacote durante a validação; conflitos com
  -- outros clientes continuam bloqueados.
  IF v_package_id IS NOT NULL THEN
    PERFORM set_config('app.reschedule_package_id', v_package_id::text, true);
    PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
    PERFORM set_config('app.skip_rebuild_pa', '1', true);
  END IF;

  v_conflict := public.appointment_conflict_reason(
    v_appt.id, v_prof, v_room, v_equip, v_start, v_end, 'scheduled'
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '%', v_conflict USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
  SET start_time = v_start,
      end_time = v_end,
      professional_id = v_prof,
      room_id = v_room,
      equipment_id = v_equip,
      service_id = COALESCE(v_service, v_pkg_service_id),
      notes = v_notes,
      status = CASE WHEN status IN ('cancelled'::public.appointment_status,
                                    'rescheduled'::public.appointment_status)
                    THEN 'scheduled'::public.appointment_status ELSE status END,
      service_name_snapshot = COALESCE(NULLIF(service_name_snapshot, ''), v_service_name),
      package_name_snapshot = COALESCE(NULLIF(package_name_snapshot, ''), v_package_name),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_updated;

  IF v_pa_id IS NOT NULL THEN
    UPDATE public.package_appointments
    SET appointment_id = p_appointment_id,
        scheduled_date = v_start,
        status = CASE WHEN status IN ('cancelled','rescheduled','pending') THEN 'scheduled' ELSE status END,
        service_id = COALESCE(service_id, v_pkg_service_id),
        updated_at = now()
    WHERE id = v_pa_id;
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);
  PERFORM set_config('app.reschedule_package_id', '', true);

  RETURN v_updated;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.reschedule_package_id', '', true);
  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);
  RAISE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reschedule_package_appointment_safely(uuid, timestamptz, timestamptz, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_conflict_reason(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) TO authenticated;