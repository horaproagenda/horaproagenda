-- =====================================================================
-- Kits de serviços: agendamento individual por serviço, com escopos
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_composite_kit_appointments(
  p_client_id uuid,
  p_items jsonb,
  p_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_group uuid := COALESCE(p_group_id, gen_random_uuid());
  v_item jsonb;
  v_idx int := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_reason text;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_existing uuid[];
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o cliente antes de salvar o kit.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum serviço do kit foi informado.';
  END IF;

  -- Idempotência: a mesma tentativa (mesmo grupo) não cria registros duplicados.
  SELECT array_agg(a.id ORDER BY a.composite_sequence_order)
    INTO v_existing
  FROM public.appointments a
  WHERE a.composite_group_id = v_group;

  IF v_existing IS NOT NULL AND array_length(v_existing, 1) > 0 THEN
    RETURN jsonb_build_object(
      'composite_group_id', v_group,
      'appointment_ids', to_jsonb(v_existing),
      'count', array_length(v_existing, 1),
      'already_created', true
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    v_start := NULLIF(v_item->>'start_time', '')::timestamptz;
    v_end := NULLIF(v_item->>'end_time', '')::timestamptz;

    IF v_start IS NULL OR v_end IS NULL THEN
      RAISE EXCEPTION 'O serviço % do kit está sem data ou horário.', v_idx;
    END IF;
    IF v_end <= v_start THEN
      RAISE EXCEPTION 'O serviço % do kit está com duração inválida.', v_idx;
    END IF;

    v_reason := public.appointment_conflict_reason(
      NULL,
      NULLIF(v_item->>'professional_id', '')::uuid,
      NULLIF(v_item->>'room_id', '')::uuid,
      NULLIF(v_item->>'equipment_id', '')::uuid,
      v_start,
      v_end,
      'scheduled'
    );
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Serviço % do kit: %', v_idx, v_reason;
    END IF;

    INSERT INTO public.appointments (
      client_id, service_id, professional_id, room_id, equipment_id,
      start_time, end_time, status, payment_status, notes,
      discount_amount, service_name_snapshot,
      composite_group_id, composite_sequence_order,
      created_by, updated_by
    ) VALUES (
      p_client_id,
      NULLIF(v_item->>'service_id', '')::uuid,
      NULLIF(v_item->>'professional_id', '')::uuid,
      NULLIF(v_item->>'room_id', '')::uuid,
      NULLIF(v_item->>'equipment_id', '')::uuid,
      v_start,
      v_end,
      'scheduled',
      COALESCE(NULLIF(v_item->>'payment_status', ''), 'pending'),
      NULLIF(v_item->>'notes', ''),
      COALESCE(NULLIF(v_item->>'discount_amount', '')::numeric, 0),
      NULLIF(v_item->>'service_name_snapshot', ''),
      v_group,
      COALESCE(NULLIF(v_item->>'sequence_order', '')::int, v_idx),
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO v_id;

    v_ids := v_ids || v_id;
  END LOOP;

  RETURN jsonb_build_object(
    'composite_group_id', v_group,
    'appointment_ids', to_jsonb(v_ids),
    'count', COALESCE(array_length(v_ids, 1), 0),
    'already_created', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_composite_kit_appointments(uuid, jsonb, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Listagem dos agendamentos de um kit (para revisão antes de confirmar)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_kit_appointments(p_appointment_id uuid)
RETURNS TABLE (
  id uuid,
  service_id uuid,
  service_name text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  payment_status text,
  amount_paid numeric,
  sequence_order int
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT a.id,
         a.service_id,
         COALESCE(s.name, a.service_name_snapshot, 'Serviço'),
         a.start_time,
         a.end_time,
         a.status::text,
         a.payment_status,
         a.amount_paid,
         a.composite_sequence_order
  FROM public.appointments a
  LEFT JOIN public.services s ON s.id = a.service_id
  WHERE a.composite_group_id IS NOT NULL
    AND a.composite_group_id = (
      SELECT r.composite_group_id FROM public.appointments r WHERE r.id = p_appointment_id
    )
  ORDER BY a.start_time;
$$;

GRANT EXECUTE ON FUNCTION public.list_kit_appointments(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Reagendamento por escopo: single | future | all
-- ---------------------------------------------------------------------
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

  v_new_end := COALESCE(p_new_end, p_new_start + (v_ref.end_time - v_ref.start_time));
  v_delta := p_new_start - v_ref.start_time;

  -- Referência
  v_reason := public.appointment_conflict_reason(
    v_ref.id, v_ref.professional_id, v_ref.room_id, v_ref.equipment_id,
    p_new_start, v_new_end, 'scheduled'
  );
  IF v_reason IS NOT NULL THEN
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

  RETURN jsonb_build_object(
    'appointment_ids', to_jsonb(v_affected),
    'count', COALESCE(array_length(v_affected, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_kit_appointments(uuid, text, timestamptz, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------
-- Exclusão/cancelamento por escopo: single | future | all
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_kit_appointments(
  p_appointment_id uuid,
  p_scope text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ref record;
  v_row record;
  v_deleted int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
BEGIN
  IF p_scope NOT IN ('single', 'future', 'all') THEN
    RAISE EXCEPTION 'Escopo inválido para remover o kit.';
  END IF;

  SELECT * INTO v_ref FROM public.appointments WHERE id = p_appointment_id;
  IF v_ref.id IS NULL THEN
    RAISE EXCEPTION 'Agendamento não encontrado.';
  END IF;

  FOR v_row IN
    SELECT * FROM public.appointments
    WHERE (
        CASE
          WHEN p_scope = 'single' OR v_ref.composite_group_id IS NULL THEN id = v_ref.id
          WHEN p_scope = 'all' THEN composite_group_id = v_ref.composite_group_id
          ELSE composite_group_id = v_ref.composite_group_id
               AND (id = v_ref.id OR start_time > v_ref.start_time)
        END
      )
    ORDER BY start_time
  LOOP
    IF v_row.status IN ('completed', 'cancelled', 'missed') THEN
      -- Histórico do cliente é preservado.
      v_kept := v_kept + 1;
    ELSIF v_row.status = 'confirmed' OR COALESCE(v_row.amount_paid, 0) > 0 THEN
      UPDATE public.appointments
         SET status = 'cancelled',
             notes = COALESCE(notes, '') ||
               CASE WHEN COALESCE(p_reason, '') = '' THEN '' ELSE E'\nCancelamento do kit: ' || p_reason END,
             updated_by = auth.uid(),
             updated_at = now()
       WHERE id = v_row.id;
      v_cancelled := v_cancelled + 1;
    ELSE
      DELETE FROM public.appointments WHERE id = v_row.id;
      v_deleted := v_deleted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'cancelled', v_cancelled,
    'kept', v_kept
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_kit_appointments(uuid, text, text) TO authenticated;