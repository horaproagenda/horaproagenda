CREATE OR REPLACE FUNCTION public.reschedule_package_appointment_safely(
  p_appointment_id uuid,
  p_new_start timestamptz,
  p_new_end timestamptz,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_appt public.appointments;
  v_updated public.appointments;
  v_package_id uuid;
  v_pa_id uuid;
  v_service_id uuid;
  v_package_name text;
  v_service_name text;
  v_conflict text;
BEGIN
  IF p_appointment_id IS NULL OR p_new_start IS NULL OR p_new_end IS NULL OR p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'Informe uma data e um horário de término válidos para reagendar.';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND account_owner_id = public.get_user_account_owner_id(auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão para alteração.';
  END IF;

  IF p_expected_version IS NOT NULL AND v_appt.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Este agendamento foi atualizado em outro dispositivo. Atualize a agenda e tente novamente.' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.package_appointment_id IS NOT NULL THEN
    SELECT pa.id, pa.package_id, COALESCE(pa.service_id, v_appt.service_id, sp.service_id), sp.name, svc.name
      INTO v_pa_id, v_package_id, v_service_id, v_package_name, v_service_name
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, v_appt.service_id, sp.service_id)
    WHERE pa.id = v_appt.package_appointment_id
      AND pa.account_owner_id = v_appt.account_owner_id;
  END IF;

  -- Ignora somente as próprias sessões do pacote durante a cascata. Conflitos
  -- com outros clientes/pacotes continuam bloqueados pelo trigger central.
  IF v_package_id IS NOT NULL THEN
    PERFORM set_config('app.reschedule_package_id', v_package_id::text, true);
    PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
    PERFORM set_config('app.skip_rebuild_pa', '1', true);
  END IF;

  -- Valida explicitamente o horário escolhido contra compromissos externos.
  v_conflict := public.appointment_has_conflict(
    v_appt.id,
    v_appt.professional_id,
    p_new_start,
    p_new_end,
    'scheduled'
  );
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'O profissional já possui outro atendimento nesse horário.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.appointments
  SET start_time = p_new_start,
      end_time = p_new_end,
      status = 'scheduled'::public.appointment_status,
      service_id = COALESCE(service_id, v_service_id),
      service_name_snapshot = COALESCE(NULLIF(service_name_snapshot, ''), v_service_name),
      package_name_snapshot = COALESCE(NULLIF(package_name_snapshot, ''), v_package_name),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_updated;

  IF v_pa_id IS NOT NULL THEN
    UPDATE public.package_appointments
    SET appointment_id = p_appointment_id,
        scheduled_date = p_new_start,
        status = 'scheduled',
        service_id = COALESCE(service_id, v_service_id),
        updated_at = now()
    WHERE id = v_pa_id;
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);

  IF v_pa_id IS NOT NULL THEN
    PERFORM public.recalculate_package_minimum_intervals(v_pa_id);
  END IF;

  IF v_package_id IS NOT NULL THEN
    PERFORM set_config('app.reschedule_package_id', '', true);
  END IF;

  RETURN v_updated;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.reschedule_package_id', '', true);
  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.reschedule_package_appointment_safely(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_package_appointment_safely(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;