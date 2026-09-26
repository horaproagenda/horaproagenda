-- =====================================================================
-- 1) Transação atômica única: agenda TODAS as sessões do pacote
-- =====================================================================
CREATE OR REPLACE FUNCTION public.schedule_package_sessions_batch(
  p_client_id uuid,
  p_package_id uuid,
  p_items jsonb,
  p_batch_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record;
  v_item jsonb;
  v_idx int := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_reason text;
  v_pa record;
  v_appt_id uuid;
  v_service_name text;
  v_created jsonb := '[]'::jsonb;
  v_existing jsonb := '[]'::jsonb;
  v_step_label text;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o cliente antes de agendar as sessões.';
  END IF;

  SELECT * INTO v_pkg FROM public.service_packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado.';
  END IF;
  IF NOT public.can_access_service_package(p_package_id) THEN
    RAISE EXCEPTION 'Sem permissão para usar este pacote.';
  END IF;
  IF v_pkg.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'O pacote não pertence a este cliente.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhuma sessão foi informada para agendamento.';
  END IF;

  PERFORM public.heal_package_service_links(p_package_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    v_start := NULLIF(v_item->>'start_time', '')::timestamptz;
    v_end   := NULLIF(v_item->>'end_time', '')::timestamptz;

    -- Etapa: sempre pelo ID único, para que a etapa 6 continue sendo a 6.
    SELECT * INTO v_pa
    FROM public.package_appointments
    WHERE id = NULLIF(v_item->>'package_appointment_id', '')::uuid
      AND package_id = p_package_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'A sessão % não tem etapa correspondente neste pacote. Feche e abra o agendamento novamente.', v_idx;
    END IF;

    v_step_label := 'Aplicação ' || COALESCE(v_pa.original_session_number, v_pa.sequence_order, v_pa.session_number, v_idx)::text;
    SELECT name INTO v_service_name FROM public.services WHERE id = COALESCE(v_pa.service_id, NULLIF(v_item->>'service_id','')::uuid);
    IF v_service_name IS NOT NULL THEN
      v_step_label := v_step_label || ' (' || v_service_name || ')';
    END IF;

    -- Idempotência: etapa já agendada nesta ou em tentativa anterior.
    IF v_pa.appointment_id IS NOT NULL THEN
      v_existing := v_existing || jsonb_build_object(
        'package_appointment_id', v_pa.id,
        'appointment_id', v_pa.appointment_id,
        'step', COALESCE(v_pa.original_session_number, v_pa.sequence_order, v_pa.session_number)
      );
      CONTINUE;
    END IF;

    IF v_start IS NULL OR v_end IS NULL THEN
      RAISE EXCEPTION '% está sem data ou horário.', v_step_label;
    END IF;
    IF v_end <= v_start THEN
      RAISE EXCEPTION '% está com duração inválida.', v_step_label;
    END IF;

    -- MESMA verificação usada pela tela (appointment_conflict_reason).
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
      RAISE EXCEPTION '%: %', v_step_label, v_reason;
    END IF;

    INSERT INTO public.appointments (
      client_id, service_id, professional_id, room_id, equipment_id,
      start_time, end_time, status, payment_status, notes,
      discount_amount, created_by, updated_by
    ) VALUES (
      p_client_id,
      COALESCE(v_pa.service_id, NULLIF(v_item->>'service_id', '')::uuid),
      NULLIF(v_item->>'professional_id', '')::uuid,
      NULLIF(v_item->>'room_id', '')::uuid,
      NULLIF(v_item->>'equipment_id', '')::uuid,
      v_start,
      v_end,
      'scheduled',
      COALESCE(NULLIF(v_item->>'payment_status', ''), 'pending'),
      NULLIF(v_item->>'notes', ''),
      COALESCE(NULLIF(v_item->>'discount_amount', '')::numeric, 0),
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO v_appt_id;

    PERFORM public.link_package_session_to_appointment(p_package_id, v_appt_id, v_pa.id);

    v_created := v_created || jsonb_build_object(
      'package_appointment_id', v_pa.id,
      'appointment_id', v_appt_id,
      'step', COALESCE(v_pa.original_session_number, v_pa.sequence_order, v_pa.session_number),
      'start_time', v_start,
      'end_time', v_end,
      'service_id', COALESCE(v_pa.service_id, NULLIF(v_item->>'service_id', '')::uuid)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'package_id', p_package_id,
    'batch_key', p_batch_key,
    'created', v_created,
    'already_scheduled', v_existing,
    'created_count', jsonb_array_length(v_created),
    'requested_count', jsonb_array_length(p_items)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.schedule_package_sessions_batch(uuid, uuid, jsonb, uuid) TO authenticated, service_role;

-- =====================================================================
-- 2) Conferência: o que foi gravado confere com o formulário?
-- =====================================================================
CREATE OR REPLACE FUNCTION public.verify_package_schedule_batch(
  p_package_id uuid,
  p_expected jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_checked int := 0;
  v_pa record;
  v_appt record;
  v_expected_start timestamptz;
  v_expected_service uuid;
  v_step text;
BEGIN
  IF p_expected IS NULL OR jsonb_array_length(p_expected) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'checked', 0, 'issues', v_issues);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_expected) LOOP
    v_checked := v_checked + 1;
    v_expected_start := NULLIF(v_item->>'start_time', '')::timestamptz;
    v_expected_service := NULLIF(v_item->>'service_id', '')::uuid;

    SELECT * INTO v_pa FROM public.package_appointments
    WHERE id = NULLIF(v_item->>'package_appointment_id', '')::uuid AND package_id = p_package_id;

    IF NOT FOUND THEN
      v_issues := v_issues || jsonb_build_object('step', NULL, 'problem', 'Etapa do pacote não encontrada.');
      CONTINUE;
    END IF;

    v_step := COALESCE(v_pa.original_session_number, v_pa.sequence_order, v_pa.session_number)::text;

    IF v_pa.appointment_id IS NULL THEN
      v_issues := v_issues || jsonb_build_object(
        'step', v_step,
        'package_appointment_id', v_pa.id,
        'problem', 'Aplicação ' || v_step || ' ficou sem agendamento.');
      CONTINUE;
    END IF;

    SELECT * INTO v_appt FROM public.appointments WHERE id = v_pa.appointment_id;
    IF NOT FOUND THEN
      v_issues := v_issues || jsonb_build_object(
        'step', v_step,
        'package_appointment_id', v_pa.id,
        'problem', 'Aplicação ' || v_step || ' aponta para um agendamento inexistente.');
      CONTINUE;
    END IF;

    IF v_expected_start IS NOT NULL AND v_appt.start_time <> v_expected_start THEN
      v_issues := v_issues || jsonb_build_object(
        'step', v_step,
        'package_appointment_id', v_pa.id,
        'problem', 'Aplicação ' || v_step || ' foi gravada em '
          || to_char(v_appt.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
          || ' em vez de '
          || to_char(v_expected_start AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.');
    END IF;

    IF v_expected_service IS NOT NULL AND v_appt.service_id IS DISTINCT FROM v_expected_service THEN
      v_issues := v_issues || jsonb_build_object(
        'step', v_step,
        'package_appointment_id', v_pa.id,
        'problem', 'Aplicação ' || v_step || ' ficou com outro serviço.');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_issues) = 0,
    'checked', v_checked,
    'issues', v_issues
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_package_schedule_batch(uuid, jsonb) TO authenticated, service_role;

-- =====================================================================
-- 3) Correção automática (sem intervenção manual)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.autoheal_package_schedule(p_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cleared int := 0;
  v_relinked int := 0;
  v_services int := 0;
  v_row record;
  v_pa record;
BEGIN
  IF p_package_id IS NULL THEN
    RETURN jsonb_build_object('cleared', 0, 'relinked', 0, 'service_fixed', 0);
  END IF;
  IF NOT public.can_access_service_package(p_package_id) THEN
    RETURN jsonb_build_object('cleared', 0, 'relinked', 0, 'service_fixed', 0);
  END IF;

  -- a) etapas apontando para agendamentos apagados voltam a ficar livres
  WITH broken AS (
    SELECT pa.id FROM public.package_appointments pa
    WHERE pa.package_id = p_package_id
      AND pa.appointment_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = pa.appointment_id)
  )
  UPDATE public.package_appointments pa
  SET appointment_id = NULL,
      scheduled_date = NULL,
      status = 'pending',
      updated_at = now()
  FROM broken b WHERE pa.id = b.id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- b) agendamentos do pacote que ficaram soltos voltam para a etapa certa
  FOR v_row IN
    SELECT a.id, a.start_time
    FROM public.appointments a
    WHERE a.package_appointment_id IS NULL
      AND a.client_id = (SELECT client_id FROM public.service_packages WHERE id = p_package_id)
      AND a.package_name_snapshot = (SELECT name FROM public.service_packages WHERE id = p_package_id)
      AND a.status NOT IN ('cancelled'::appointment_status, 'rescheduled'::appointment_status)
    ORDER BY a.start_time
  LOOP
    SELECT * INTO v_pa FROM public.package_appointments
    WHERE package_id = p_package_id AND appointment_id IS NULL
      AND status IN ('pending','scheduled','rescheduled')
    ORDER BY COALESCE(original_session_number, sequence_order, session_number)
    LIMIT 1 FOR UPDATE;
    EXIT WHEN NOT FOUND;
    BEGIN
      PERFORM public.link_package_session_to_appointment(p_package_id, v_row.id, v_pa.id);
      v_relinked := v_relinked + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- c) serviço de cada etapa e contagem de sessões
  BEGIN
    PERFORM public.heal_package_service_links(p_package_id);
    v_services := 1;
  EXCEPTION WHEN OTHERS THEN
    v_services := 0;
  END;

  UPDATE public.service_packages sp
  SET sessions_scheduled = COALESCE(sub.c, 0), updated_at = now()
  FROM (
    SELECT count(*)::integer AS c FROM public.package_appointments
    WHERE package_id = p_package_id AND appointment_id IS NOT NULL AND status <> 'cancelled'
  ) sub
  WHERE sp.id = p_package_id;

  RETURN jsonb_build_object('cleared', v_cleared, 'relinked', v_relinked, 'service_fixed', v_services);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.autoheal_package_schedule(uuid) TO authenticated, service_role;

-- =====================================================================
-- 4) Kits: mensagem com nome do serviço + verificação idêntica à da tela
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_composite_kit_appointments(p_client_id uuid, p_items jsonb, p_group_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
  v_label text;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o cliente antes de salvar o kit.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum serviço do kit foi informado.';
  END IF;

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

    v_label := COALESCE(
      NULLIF(v_item->>'service_name_snapshot', ''),
      (SELECT name FROM public.services WHERE id = NULLIF(v_item->>'service_id','')::uuid),
      'Serviço ' || v_idx::text
    );

    IF v_start IS NULL OR v_end IS NULL THEN
      RAISE EXCEPTION '% (item % do kit) está sem data ou horário.', v_label, v_idx;
    END IF;
    IF v_end <= v_start THEN
      RAISE EXCEPTION '% (item % do kit) está com duração inválida.', v_label, v_idx;
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
      RAISE EXCEPTION '%: %', v_label, v_reason;
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
$function$;
