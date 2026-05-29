
CREATE OR REPLACE FUNCTION public.appointment_has_conflict(
  p_id uuid,
  p_professional_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_status text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_id uuid;
  v_absence_id uuid;
BEGIN
  IF p_status IN ('cancelled','missed','rescheduled') THEN RETURN NULL; END IF;
  IF p_professional_id IS NULL THEN RETURN NULL; END IF;

  SELECT a.id INTO v_conflict_id
  FROM appointments a
  WHERE a.professional_id = p_professional_id
    AND a.status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
    AND (p_id IS NULL OR a.id <> p_id)
    AND a.start_time < p_end
    AND a.end_time   > p_start
  LIMIT 1;
  IF v_conflict_id IS NOT NULL THEN
    RETURN 'Conflito: profissional já possui agendamento no horário (' || v_conflict_id::text || ')';
  END IF;

  SELECT pa.id INTO v_absence_id
  FROM professional_absences pa
  WHERE pa.professional_id = p_professional_id
    AND pa.start_time < p_end
    AND pa.end_time   > p_start
  LIMIT 1;
  IF v_absence_id IS NOT NULL THEN
    RETURN 'Conflito: profissional ausente neste horário (' || v_absence_id::text || ')';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.corrigir_agendamentos_duplicados()
RETURNS TABLE(appointment_id uuid, old_start timestamptz, new_start timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row record;
  v_interval_days int;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_duration interval;
  v_attempts int;
  v_conflict text;
BEGIN
  FOR v_row IN
    WITH dupes AS (
      SELECT professional_id, start_time
      FROM appointments
      WHERE status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
        AND professional_id IS NOT NULL
      GROUP BY professional_id, start_time
      HAVING COUNT(*) > 1
    ),
    ranked AS (
      SELECT a.id, a.start_time, a.end_time, a.professional_id, a.service_id, a.status::text AS status_text,
             ROW_NUMBER() OVER (
               PARTITION BY a.professional_id, a.start_time
               ORDER BY CASE WHEN a.status = 'completed'::appointment_status THEN 0 ELSE 1 END,
                        a.created_at ASC, a.id ASC
             ) AS rn
      FROM appointments a
      JOIN dupes d ON d.professional_id = a.professional_id AND d.start_time = a.start_time
      WHERE a.status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status)
    )
    SELECT * FROM ranked WHERE rn > 1
  LOOP
    v_duration := v_row.end_time - v_row.start_time;
    SELECT COALESCE(s.return_days, 21) INTO v_interval_days FROM services s WHERE s.id = v_row.service_id;
    IF v_interval_days IS NULL OR v_interval_days <= 0 THEN v_interval_days := 21; END IF;

    v_new_start := v_row.start_time;
    v_attempts := 0;
    LOOP
      v_new_start := v_new_start + (v_interval_days || ' days')::interval;
      v_new_end   := v_new_start + v_duration;
      v_conflict := public.appointment_has_conflict(v_row.id, v_row.professional_id, v_new_start, v_new_end, v_row.status_text);
      v_attempts := v_attempts + 1;
      EXIT WHEN v_conflict IS NULL OR v_attempts >= 24;
    END LOOP;

    IF v_conflict IS NULL THEN
      UPDATE appointments SET start_time = v_new_start, end_time = v_new_end, updated_at = now() WHERE id = v_row.id;
      UPDATE package_appointments SET scheduled_date = v_new_start
        WHERE id = (SELECT package_appointment_id FROM appointments WHERE id = v_row.id);
      appointment_id := v_row.id; old_start := v_row.start_time; new_start := v_new_start;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

SELECT * FROM public.corrigir_agendamentos_duplicados();

CREATE OR REPLACE FUNCTION public.tg_block_appointment_conflicts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_msg text;
BEGIN
  v_msg := public.appointment_has_conflict(NEW.id, NEW.professional_id, NEW.start_time, NEW.end_time, NEW.status::text);
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'AGENDAMENTO_CONFLITO: %', v_msg USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_appointment_conflicts ON public.appointments;
CREATE TRIGGER trg_block_appointment_conflicts
BEFORE INSERT OR UPDATE OF start_time, end_time, professional_id, status
ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.tg_block_appointment_conflicts();

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_prof_start
ON public.appointments (professional_id, start_time)
WHERE status NOT IN ('cancelled'::appointment_status,'missed'::appointment_status,'rescheduled'::appointment_status);
