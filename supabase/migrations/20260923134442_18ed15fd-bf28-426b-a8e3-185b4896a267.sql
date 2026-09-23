-- 1) Serviço da etapa resolve pela etapa ORIGINAL (imutável), nunca pela ordem recalculada
CREATE OR REPLACE FUNCTION public.heal_package_service_links(_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record;
  v_fallback_service_id uuid;
  v_package_rows integer := 0;
  v_session_rows integer := 0;
  v_appointment_rows integer := 0;
BEGIN
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote não encontrado'; END IF;
  IF NOT public.can_access_service_package(_package_id) THEN
    RAISE EXCEPTION 'Sem permissão para ajustar este pacote';
  END IF;

  IF v_pkg.package_type <> 'sequential' THEN
    v_fallback_service_id := public.resolve_service_id_for_package(_package_id, NULL);

    IF v_pkg.service_id IS NULL AND v_fallback_service_id IS NOT NULL THEN
      UPDATE public.service_packages
      SET service_id = v_fallback_service_id, updated_at = now()
      WHERE id = _package_id AND service_id IS NULL;
      GET DIAGNOSTICS v_package_rows = ROW_COUNT;
    END IF;
  END IF;

  -- A chave da etapa é original_session_number: ele nunca muda ao reagendar.
  UPDATE public.package_appointments pa
  SET service_id = public.resolve_service_id_for_package(
        pa.package_id,
        COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
      ),
      updated_at = now()
  WHERE pa.package_id = _package_id
    AND public.resolve_service_id_for_package(
          pa.package_id,
          COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
        ) IS NOT NULL
    AND pa.service_id IS DISTINCT FROM public.resolve_service_id_for_package(
          pa.package_id,
          COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
        );
  GET DIAGNOSTICS v_session_rows = ROW_COUNT;

  UPDATE public.appointments a
  SET service_id = pa.service_id,
      service_name_snapshot = s.name,
      package_name_snapshot = sp.name,
      updated_at = now()
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  LEFT JOIN public.services s ON s.id = pa.service_id
  WHERE pa.package_id = _package_id
    AND a.package_appointment_id = pa.id
    AND pa.service_id IS NOT NULL
    AND (
      a.service_id IS DISTINCT FROM pa.service_id
      OR a.service_name_snapshot IS DISTINCT FROM s.name
      OR a.package_name_snapshot IS DISTINCT FROM sp.name
    );
  GET DIAGNOSTICS v_appointment_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'packageId', _package_id,
    'packageServiceFixed', v_package_rows,
    'sessionServicesFixed', v_session_rows,
    'appointmentServicesFixed', v_appointment_rows
  );
END;
$function$;

-- 2) Reparo dedicado de pacotes sequenciais: serviço por etapa + etapas faltantes
CREATE OR REPLACE FUNCTION public.repair_sequential_package_steps(_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record;
  v_step record;
  v_fixed_steps integer := 0;
  v_fixed_appointments integer := 0;
  v_created_steps integer := 0;
  v_expected uuid;
BEGIN
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('packageId', _package_id, 'skipped', true); END IF;
  IF v_pkg.package_type <> 'sequential' THEN
    RETURN jsonb_build_object('packageId', _package_id, 'skipped', true);
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
  PERFORM set_config('app.skip_rebuild_pa', '1', true);
  PERFORM set_config('app.allow_sequential_step_change', '1', true);

  -- normaliza a numeração da etapa (a ordem cronológica é calculada na tela)
  UPDATE public.package_appointments pa
  SET original_session_number = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number),
      sequence_order = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number),
      session_number = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number),
      updated_at = now()
  WHERE pa.package_id = _package_id
    AND (
      pa.original_session_number IS DISTINCT FROM COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
      OR pa.sequence_order IS DISTINCT FROM COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
      OR pa.session_number IS DISTINCT FROM COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
    );

  -- serviço de cada etapa volta a ser o do modelo
  UPDATE public.package_appointments pa
  SET service_id = public.resolve_service_id_for_package(pa.package_id, pa.original_session_number),
      updated_at = now()
  WHERE pa.package_id = _package_id
    AND public.resolve_service_id_for_package(pa.package_id, pa.original_session_number) IS NOT NULL
    AND pa.service_id IS DISTINCT FROM public.resolve_service_id_for_package(pa.package_id, pa.original_session_number);
  GET DIAGNOSTICS v_fixed_steps = ROW_COUNT;

  -- agendamentos acompanham o serviço da sua etapa
  UPDATE public.appointments a
  SET service_id = pa.service_id,
      service_name_snapshot = s.name,
      package_name_snapshot = v_pkg.name,
      updated_at = now()
  FROM public.package_appointments pa
  LEFT JOIN public.services s ON s.id = pa.service_id
  WHERE pa.package_id = _package_id
    AND a.package_appointment_id = pa.id
    AND pa.service_id IS NOT NULL
    AND (
      a.service_id IS DISTINCT FROM pa.service_id
      OR a.service_name_snapshot IS DISTINCT FROM s.name
      OR a.package_name_snapshot IS DISTINCT FROM v_pkg.name
    );
  GET DIAGNOSTICS v_fixed_appointments = ROW_COUNT;

  -- recria etapas que desapareceram (ex.: avaliação final)
  IF v_pkg.template_id IS NOT NULL THEN
    FOR v_step IN
      SELECT pts.sequence_order, pts.service_id, COALESCE(pts.interval_after_days, v_pkg.interval_days, 0) AS interval_after_days
      FROM public.package_template_steps pts
      WHERE pts.template_id = v_pkg.template_id
        AND pts.sequence_order <= COALESCE(v_pkg.total_sessions, 0)
        AND NOT EXISTS (
          SELECT 1 FROM public.package_appointments pa
          WHERE pa.package_id = _package_id
            AND COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number) = pts.sequence_order
        )
      ORDER BY pts.sequence_order
    LOOP
      INSERT INTO public.package_appointments (
        package_id, appointment_id, session_number, original_session_number,
        sequence_order, interval_after_days, scheduled_date, status,
        service_id, account_owner_id
      ) VALUES (
        _package_id, NULL, v_step.sequence_order, v_step.sequence_order,
        v_step.sequence_order, v_step.interval_after_days, NULL, 'pending',
        v_step.service_id, v_pkg.account_owner_id
      );
      v_created_steps := v_created_steps + 1;
    END LOOP;
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);
  PERFORM set_config('app.allow_sequential_step_change', '0', true);

  PERFORM public.recount_service_package_sessions(_package_id);

  RETURN jsonb_build_object(
    'packageId', _package_id,
    'stepServicesFixed', v_fixed_steps,
    'appointmentServicesFixed', v_fixed_appointments,
    'stepsRecreated', v_created_steps
  );
END;
$function$;

-- 3) Reconstrução nunca renumera pacote sequencial
CREATE OR REPLACE FUNCTION public.rebuild_package_appointments(_package_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _total integer;
  _account_owner uuid;
  _service_id uuid;
  _interval integer;
  _type text;
  _row record;
  _seq integer := 0;
BEGIN
  IF _package_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT total_sessions, account_owner_id, service_id, COALESCE(interval_days, 0), package_type
    INTO _total, _account_owner, _service_id, _interval, _type
  FROM public.service_packages
  WHERE id = _package_id;

  IF _total IS NULL OR _total <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
  PERFORM set_config('app.skip_rebuild_pa', '1', true);

  DELETE FROM public.package_appointments pa
  WHERE pa.package_id = _package_id
    AND pa.appointment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.package_appointments pa2
      WHERE pa2.package_id = pa.package_id
        AND pa2.appointment_id = pa.appointment_id
        AND pa2.id <> pa.id
        AND pa2.created_at >= pa.created_at
    );

  IF _type = 'sequential' THEN
    -- Etapas do pacote sequencial são fixas: só sincroniza data e status.
    PERFORM set_config('app.allow_sequential_step_change', '1', true);

    UPDATE public.package_appointments pa
    SET scheduled_date = a.start_time,
        status = CASE WHEN a.status::text IN ('confirmed','scheduled') THEN 'scheduled' ELSE a.status::text END,
        updated_at = now()
    FROM public.appointments a
    WHERE a.id = pa.appointment_id
      AND pa.package_id = _package_id
      AND (
        pa.scheduled_date IS DISTINCT FROM a.start_time
        OR pa.status IS DISTINCT FROM (CASE WHEN a.status::text IN ('confirmed','scheduled') THEN 'scheduled' ELSE a.status::text END)
      );

    PERFORM set_config('app.allow_sequential_step_change', '0', true);
    PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
    PERFORM set_config('app.skip_rebuild_pa', '0', true);

    PERFORM public.repair_sequential_package_steps(_package_id);
    RETURN _total;
  END IF;

  _seq := 0;
  FOR _row IN
    SELECT pa.id, a.start_time, a.status::text AS appt_status
    FROM public.package_appointments pa
    JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.package_id = _package_id
      AND a.status NOT IN ('cancelled', 'rescheduled')
    ORDER BY a.start_time ASC, pa.created_at ASC
  LOOP
    _seq := _seq + 1;
    UPDATE public.package_appointments
       SET session_number = _seq,
           sequence_order = _seq,
           original_session_number = COALESCE(original_session_number, _seq),
           scheduled_date = _row.start_time,
           status = CASE WHEN _row.appt_status IN ('confirmed','scheduled') THEN 'scheduled' ELSE _row.appt_status END,
           updated_at = now()
     WHERE id = _row.id;
  END LOOP;

  FOR _row IN
    SELECT pa.id
    FROM public.package_appointments pa
    WHERE pa.package_id = _package_id
      AND pa.appointment_id IS NULL
    ORDER BY pa.created_at ASC, pa.id ASC
  LOOP
    _seq := _seq + 1;
    IF _seq > _total THEN
      DELETE FROM public.package_appointments WHERE id = _row.id;
      _seq := _seq - 1;
      CONTINUE;
    END IF;
    UPDATE public.package_appointments
       SET session_number = _seq,
           sequence_order = _seq,
           original_session_number = COALESCE(original_session_number, _seq),
           scheduled_date = NULL,
           status = 'pending',
           updated_at = now()
     WHERE id = _row.id;
  END LOOP;

  WHILE _seq < _total LOOP
    _seq := _seq + 1;
    INSERT INTO public.package_appointments (
      package_id, appointment_id, session_number, original_session_number,
      sequence_order, interval_after_days, scheduled_date, status,
      service_id, account_owner_id
    ) VALUES (
      _package_id, NULL, _seq, _seq, _seq, _interval, NULL, 'pending',
      _service_id, _account_owner
    );
  END LOOP;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);

  PERFORM public.recount_service_package_sessions(_package_id);

  RETURN _seq;
END;
$function$;

-- 4) Trava no banco: etapa de pacote sequencial é imutável
CREATE OR REPLACE FUNCTION public.protect_sequential_package_step()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_step integer;
  v_expected uuid;
BEGIN
  IF COALESCE(current_setting('app.allow_sequential_step_change', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT package_type INTO v_type FROM public.service_packages WHERE id = NEW.package_id;
  IF v_type IS DISTINCT FROM 'sequential' THEN
    RETURN NEW;
  END IF;

  v_step := COALESCE(OLD.original_session_number, OLD.sequence_order, OLD.session_number);
  IF v_step IS NOT NULL THEN
    NEW.original_session_number := v_step;
    NEW.sequence_order := v_step;
    NEW.session_number := v_step;

    v_expected := public.resolve_service_id_for_package(NEW.package_id, v_step);
    IF v_expected IS NOT NULL THEN
      NEW.service_id := v_expected;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_sequential_package_step ON public.package_appointments;
CREATE TRIGGER trg_protect_sequential_package_step
BEFORE UPDATE ON public.package_appointments
FOR EACH ROW EXECUTE FUNCTION public.protect_sequential_package_step();

-- 5) Verificação e reparo de todos os pacotes sequenciais da conta
CREATE OR REPLACE FUNCTION public.get_sequential_package_integrity_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_step_mismatch integer := 0;
  v_appt_mismatch integer := 0;
  v_missing_steps integer := 0;
BEGIN
  v_owner := public.get_user_account_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('stepServiceMismatches', 0, 'appointmentServiceMismatches', 0, 'missingSteps', 0);
  END IF;

  SELECT count(*) INTO v_step_mismatch
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE sp.account_owner_id = v_owner
    AND sp.package_type = 'sequential'
    AND public.resolve_service_id_for_package(pa.package_id, COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)) IS NOT NULL
    AND pa.service_id IS DISTINCT FROM public.resolve_service_id_for_package(pa.package_id, COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number));

  SELECT count(*) INTO v_appt_mismatch
  FROM public.appointments a
  JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE sp.account_owner_id = v_owner
    AND sp.package_type = 'sequential'
    AND pa.service_id IS NOT NULL
    AND a.service_id IS DISTINCT FROM pa.service_id;

  SELECT count(*) INTO v_missing_steps
  FROM public.service_packages sp
  JOIN public.package_template_steps pts ON pts.template_id = sp.template_id
  WHERE sp.account_owner_id = v_owner
    AND sp.package_type = 'sequential'
    AND sp.is_active = true
    AND pts.sequence_order <= COALESCE(sp.total_sessions, 0)
    AND NOT EXISTS (
      SELECT 1 FROM public.package_appointments pa
      WHERE pa.package_id = sp.id
        AND COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number) = pts.sequence_order
    );

  RETURN jsonb_build_object(
    'stepServiceMismatches', COALESCE(v_step_mismatch, 0),
    'appointmentServiceMismatches', COALESCE(v_appt_mismatch, 0),
    'missingSteps', COALESCE(v_missing_steps, 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.repair_all_sequential_packages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_pkg record;
  v_result jsonb;
  v_packages integer := 0;
  v_steps integer := 0;
  v_appointments integer := 0;
  v_created integer := 0;
BEGIN
  v_owner := public.get_user_account_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('packagesRepaired', 0);
  END IF;

  FOR v_pkg IN
    SELECT id FROM public.service_packages
    WHERE account_owner_id = v_owner AND package_type = 'sequential' AND is_active = true
  LOOP
    v_result := public.repair_sequential_package_steps(v_pkg.id);
    v_packages := v_packages + 1;
    v_steps := v_steps + COALESCE((v_result->>'stepServicesFixed')::int, 0);
    v_appointments := v_appointments + COALESCE((v_result->>'appointmentServicesFixed')::int, 0);
    v_created := v_created + COALESCE((v_result->>'stepsRecreated')::int, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'packagesRepaired', v_packages,
    'stepServicesFixed', v_steps,
    'appointmentServicesFixed', v_appointments,
    'stepsRecreated', v_created
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.repair_sequential_package_steps(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sequential_package_integrity_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_all_sequential_packages() TO authenticated;