CREATE OR REPLACE FUNCTION public.find_package_session_for_appointment(p_appointment_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pa.id
  FROM public.appointments a
  JOIN public.service_packages sp ON sp.client_id = a.client_id AND sp.is_active = true
  JOIN public.package_appointments pa ON pa.package_id = sp.id
  WHERE a.id = p_appointment_id
    AND a.package_appointment_id IS NULL
    AND pa.appointment_id IS NULL
    AND pa.status = 'pending'
    AND (pa.service_id = a.service_id OR pa.service_id IS NULL)
    AND public.can_see_appointment_row(a.id)
  ORDER BY (pa.service_id = a.service_id) DESC NULLS LAST, pa.session_number
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.find_package_session_for_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_appointment_status_with_package_mode(
  p_appointment_id uuid, p_status text, p_mode text, p_expected_version integer DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.appointments;
  v_pa uuid;
BEGIN
  IF p_mode IS NOT NULL AND p_mode NOT IN ('release','consume') THEN
    RAISE EXCEPTION 'Invalid package outcome mode: %', p_mode;
  END IF;

  -- Vincula automaticamente a sessão de pacote quando o agendamento ficou sem vínculo,
  -- para que "perder aplicação" seja contabilizado corretamente.
  IF p_mode = 'consume' THEN
    v_pa := public.find_package_session_for_appointment(p_appointment_id);
    IF v_pa IS NOT NULL THEN
      UPDATE public.appointments SET package_appointment_id = v_pa WHERE id = p_appointment_id;
      UPDATE public.package_appointments
        SET appointment_id = p_appointment_id,
            scheduled_date = (SELECT start_time FROM public.appointments WHERE id = p_appointment_id),
            status = 'missed', updated_at = now()
        WHERE id = v_pa;
      p_expected_version := NULL;
    END IF;
  END IF;

  IF p_mode IS NOT NULL THEN
    PERFORM set_config('app.package_outcome_mode', p_mode, true);
  END IF;

  IF p_expected_version IS NOT NULL THEN
    UPDATE public.appointments SET status = p_status::appointment_status
    WHERE id = p_appointment_id AND version = p_expected_version
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Appointment version mismatch or not found' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    UPDATE public.appointments SET status = p_status::appointment_status
    WHERE id = p_appointment_id
    RETURNING * INTO v_row;
  END IF;

  IF v_pa IS NOT NULL THEN
    PERFORM public.recount_service_package_sessions((SELECT package_id FROM public.package_appointments WHERE id = v_pa));
  END IF;

  RETURN v_row;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.set_appointment_status_with_package_mode(uuid, text, text, integer) TO authenticated;