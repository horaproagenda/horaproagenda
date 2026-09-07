CREATE OR REPLACE FUNCTION public.reschedule_kit_appointments(
  p_appointment_id uuid,
  p_scope text,
  p_new_start timestamptz,
  p_new_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ref record;
  v_delta interval;
  v_row record;
  v_reason text;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_affected uuid[] := '{}';
BEGIN
  IF p_scope NOT IN ('single', 'future', 'all') THEN
    RAISE EXCEPTION 'Escopo inválido para alterar o kit.';
  END IF;

  SELECT * INTO v_ref FROM public.appointments WHERE id = p_appointment_id;
  IF v_ref.id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado.';
  END IF;
  IF v_ref.status IN ('completed', 'cancelled', 'missed') THEN
    RAISE EXCEPTION 'Este atendimento já foi encerrado e não pode ser alterado.';
  END IF;

  -- Esta função controla o escopo por conta própria; o gatilho de cascata
  -- automática precisa ficar desligado para não deslocar duas vezes.
  PERFORM set_config('app.skip_composite_cascade', 'on', true);

  v_new_end := COALESCE(p_new_end, p_new_start + (v_ref.end_time - v_ref.start_time));
  v_delta := p_new_start - v_ref.start_time;

  v_reason := public.appointment_conflict_reason(
    v_ref.id, v_ref.professional_id, v_ref.room_id, v_ref.equipment_id,
    p_new_start, v_new_end, 'scheduled'
  );
  IF v_reason IS NOT NULL THEN
    PERFORM set_config('app.skip_composite_cascade', 'off', true);
    RAISE EXCEPTION '%', v_reason;
  END IF;

  UPDATE public.appointments
     SET start_time = p_new_start,
         end_time = v_new_end,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = v_ref.id;
  v_affected := v_affected || v_ref.id;

  IF p_scope <> 'single' AND v_ref.composite_group_id IS NOT NULL AND v_delta <> interval '0' THEN
    FOR v_row IN
      SELECT * FROM public.appointments
      WHERE composite_group_id = v_ref.composite_group_id
        AND id <> v_ref.id
        AND status NOT IN ('completed', 'cancelled', 'missed')
        AND (p_scope = 'all' OR start_time > v_ref.start_time)
      ORDER BY start_time
    LOOP
      v_new_start := v_row.start_time + v_delta;
      v_new_end := v_row.end_time + v_delta;
      v_reason := public.appointment_conflict_reason(
        v_row.id, v_row.professional_id, v_row.room_id, v_row.equipment_id,
        v_new_start, v_new_end, 'scheduled'
      );
      IF v_reason IS NOT NULL THEN
        PERFORM set_config('app.skip_composite_cascade', 'off', true);
        RAISE EXCEPTION '%', v_reason;
      END IF;
      UPDATE public.appointments
         SET start_time = v_new_start,
             end_time = v_new_end,
             updated_by = auth.uid(),
             updated_at = now()
       WHERE id = v_row.id;
      v_affected := v_affected || v_row.id;
    END LOOP;
  END IF;

  PERFORM set_config('app.skip_composite_cascade', 'off', true);

  RETURN jsonb_build_object(
    'appointment_ids', to_jsonb(v_affected),
    'count', COALESCE(array_length(v_affected, 1), 0)
  );
END;
$$;