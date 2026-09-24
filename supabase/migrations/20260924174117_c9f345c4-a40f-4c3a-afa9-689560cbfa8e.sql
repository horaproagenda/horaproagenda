CREATE OR REPLACE FUNCTION public.reschedule_package_appointment_safely(p_appointment_id uuid, p_new_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_new_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_version integer DEFAULT NULL::integer, p_field_updates jsonb DEFAULT '{}'::jsonb)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appt public.appointments;
  v_updated public.appointments;
  v_package_id uuid;
  v_pa_id uuid;
  v_pa_service uuid;
  v_pkg_service_id uuid;
  v_package_name text;
  v_service_name text;
  v_is_sequential boolean := false;
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

  SELECT * INTO v_appt FROM public.appointments
  WHERE id = p_appointment_id
    AND account_owner_id = public.get_user_account_owner_id(auth.uid())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem permissão para alteração.' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_version IS NOT NULL AND v_appt.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'Este agendamento foi atualizado em outro dispositivo. Atualize a agenda e tente novamente.' USING ERRCODE = 'P0001';
  END IF;

  v_start := COALESCE(p_new_start, v_appt.start_time);
  v_end   := COALESCE(p_new_end, v_appt.end_time);
  IF v_end <= v_start THEN
    RAISE EXCEPTION 'O horário de término deve ser depois do horário de início.' USING ERRCODE = 'P0001';
  END IF;

  v_prof := CASE WHEN v_fields ? 'professional_id' THEN NULLIF(v_fields->>'professional_id','')::uuid ELSE v_appt.professional_id END;
  v_room := CASE WHEN v_fields ? 'room_id' THEN NULLIF(v_fields->>'room_id','')::uuid ELSE v_appt.room_id END;
  v_equip := CASE WHEN v_fields ? 'equipment_id' THEN NULLIF(v_fields->>'equipment_id','')::uuid ELSE v_appt.equipment_id END;
  v_service := CASE WHEN v_fields ? 'service_id' THEN COALESCE(NULLIF(v_fields->>'service_id','')::uuid, v_appt.service_id) ELSE v_appt.service_id END;
  v_notes := CASE WHEN v_fields ? 'notes' THEN v_fields->>'notes' ELSE v_appt.notes END;

  IF v_appt.package_appointment_id IS NOT NULL THEN
    SELECT pa.id, pa.package_id, pa.service_id, COALESCE(pa.service_id, v_service, sp.service_id), sp.name,
           (sp.package_type = 'sequential')
      INTO v_pa_id, v_package_id, v_pa_service, v_pkg_service_id, v_package_name, v_is_sequential
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    WHERE pa.id = v_appt.package_appointment_id
      AND pa.account_owner_id = v_appt.account_owner_id;

    -- Pacote sequencial: o serviço pertence à etapa, nunca à data.
    IF v_is_sequential THEN
      v_service := COALESCE(v_pa_service, v_appt.service_id);
      v_pkg_service_id := v_service;
    END IF;

    SELECT name INTO v_service_name FROM public.services WHERE id = COALESCE(v_pkg_service_id, v_service);
  END IF;

  IF v_package_id IS NOT NULL THEN
    PERFORM set_config('app.reschedule_package_id', v_package_id::text, true);
    PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
    PERFORM set_config('app.skip_rebuild_pa', '1', true);
  END IF;

  v_conflict := public.appointment_conflict_reason(v_appt.id, v_prof, v_room, v_equip, v_start, v_end, 'scheduled');
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '%', v_conflict USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments
  SET start_time = v_start,
      end_time = v_end,
      professional_id = v_prof,
      room_id = v_room,
      equipment_id = v_equip,
      service_id = CASE WHEN v_is_sequential THEN v_service ELSE COALESCE(v_service, v_pkg_service_id) END,
      notes = v_notes,
      status = CASE WHEN status IN ('cancelled'::public.appointment_status,'rescheduled'::public.appointment_status)
                    THEN 'scheduled'::public.appointment_status ELSE status END,
      service_name_snapshot = CASE WHEN v_is_sequential AND v_service_name IS NOT NULL THEN v_service_name
                                   ELSE COALESCE(NULLIF(service_name_snapshot, ''), v_service_name) END,
      package_name_snapshot = COALESCE(NULLIF(package_name_snapshot, ''), v_package_name),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_appointment_id
  RETURNING * INTO v_updated;

  IF v_pa_id IS NOT NULL THEN
    -- Só data e status mudam; etapa (sequence_order/session_number) e serviço ficam intactos.
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

-- Nome único e genérico: toda tela reagenda por aqui (avulso, série, pacote, kit).
CREATE OR REPLACE FUNCTION public.reschedule_appointment(p_appointment_id uuid, p_new_start timestamptz DEFAULT NULL, p_new_end timestamptz DEFAULT NULL, p_expected_version integer DEFAULT NULL, p_field_updates jsonb DEFAULT '{}'::jsonb)
 RETURNS appointments
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $$
  SELECT * FROM public.reschedule_package_appointment_safely(p_appointment_id, p_new_start, p_new_end, p_expected_version, p_field_updates);
$$;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, integer, jsonb) TO authenticated;