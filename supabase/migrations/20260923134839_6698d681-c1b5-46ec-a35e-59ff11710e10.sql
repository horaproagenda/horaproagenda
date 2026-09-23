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
  v_removed_steps integer := 0;
BEGIN
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('packageId', _package_id, 'skipped', true); END IF;
  IF v_pkg.package_type <> 'sequential' THEN
    RETURN jsonb_build_object('packageId', _package_id, 'skipped', true);
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
  PERFORM set_config('app.skip_rebuild_pa', '1', true);
  PERFORM set_config('app.allow_sequential_step_change', '1', true);

  UPDATE public.package_appointments pa
  SET original_session_number = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number),
      sequence_order = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number),
      session_number = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number),
      updated_at = now()
  WHERE pa.package_id = _package_id
    AND (
      pa.sequence_order IS DISTINCT FROM COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
      OR pa.session_number IS DISTINCT FROM COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
    );

  -- etapas repetidas sem atendimento vinculado são descartadas
  DELETE FROM public.package_appointments pa
  WHERE pa.package_id = _package_id
    AND pa.appointment_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.package_appointments pa2
      WHERE pa2.package_id = pa.package_id
        AND pa2.id <> pa.id
        AND COALESCE(pa2.original_session_number, pa2.sequence_order, pa2.session_number)
            = COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number)
        AND (pa2.appointment_id IS NOT NULL OR pa2.created_at < pa.created_at)
    );
  GET DIAGNOSTICS v_removed_steps = ROW_COUNT;

  -- etapas acima do total contratado e sem atendimento também saem
  DELETE FROM public.package_appointments pa
  WHERE pa.package_id = _package_id
    AND pa.appointment_id IS NULL
    AND COALESCE(v_pkg.total_sessions, 0) > 0
    AND COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number) > v_pkg.total_sessions;

  UPDATE public.package_appointments pa
  SET service_id = public.resolve_service_id_for_package(pa.package_id, pa.original_session_number),
      updated_at = now()
  WHERE pa.package_id = _package_id
    AND public.resolve_service_id_for_package(pa.package_id, pa.original_session_number) IS NOT NULL
    AND pa.service_id IS DISTINCT FROM public.resolve_service_id_for_package(pa.package_id, pa.original_session_number);
  GET DIAGNOSTICS v_fixed_steps = ROW_COUNT;

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
    'stepsRecreated', v_created_steps,
    'duplicateStepsRemoved', v_removed_steps
  );
END;
$function$;

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
  v_duplicate_steps integer := 0;
BEGIN
  v_owner := public.get_user_account_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('stepServiceMismatches', 0, 'appointmentServiceMismatches', 0, 'missingSteps', 0, 'duplicateSteps', 0);
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

  SELECT count(*) INTO v_duplicate_steps
  FROM (
    SELECT pa.package_id, COALESCE(pa.original_session_number, pa.sequence_order, pa.session_number) AS step
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    WHERE sp.account_owner_id = v_owner AND sp.package_type = 'sequential'
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) dups;

  RETURN jsonb_build_object(
    'stepServiceMismatches', COALESCE(v_step_mismatch, 0),
    'appointmentServiceMismatches', COALESCE(v_appt_mismatch, 0),
    'missingSteps', COALESCE(v_missing_steps, 0),
    'duplicateSteps', COALESCE(v_duplicate_steps, 0)
  );
END;
$function$;