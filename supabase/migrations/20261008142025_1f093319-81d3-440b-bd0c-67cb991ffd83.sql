CREATE OR REPLACE FUNCTION public.appointment_conflict_reason(
  p_id uuid, p_professional_id uuid, p_room_id uuid, p_equipment_id uuid,
  p_start timestamptz, p_end timestamptz, p_status text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_skip_package uuid; v_when text; v_row record; v_name text;
  tz constant text := 'America/Sao_Paulo';
BEGIN
  IF p_status IN ('cancelled','missed','rescheduled') THEN RETURN NULL; END IF;
  IF p_start IS NULL OR p_end IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_skip_package := NULLIF(current_setting('app.reschedule_package_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_skip_package := NULL; END;

  IF p_professional_id IS NOT NULL THEN
    SELECT a.start_time, a.end_time INTO v_row FROM public.appointments a
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    WHERE a.professional_id = p_professional_id
      AND a.status NOT IN ('cancelled','missed','rescheduled')
      AND (p_id IS NULL OR a.id <> p_id) AND a.start_time < p_end AND a.end_time > p_start
      AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
    ORDER BY a.start_time LIMIT 1;
    IF FOUND THEN
      SELECT name INTO v_name FROM public.professionals WHERE id = p_professional_id;
      v_when := to_char(v_row.start_time AT TIME ZONE tz, 'DD/MM/YYYY') || ', das '
        || to_char(v_row.start_time AT TIME ZONE tz, 'HH24:MI') || ' às ' || to_char(v_row.end_time AT TIME ZONE tz, 'HH24:MI');
      RETURN COALESCE(v_name, 'O profissional') || ' já tem um atendimento em ' || v_when || '. Escolha outro horário ou outro profissional.';
    END IF;
  END IF;

  IF p_room_id IS NOT NULL THEN
    SELECT a.start_time, a.end_time, p.name AS pname INTO v_row FROM public.appointments a
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    LEFT JOIN public.professionals p ON p.id = a.professional_id
    WHERE a.room_id = p_room_id
      AND a.status NOT IN ('cancelled','missed','rescheduled')
      AND (p_id IS NULL OR a.id <> p_id) AND a.start_time < p_end AND a.end_time > p_start
      AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
    ORDER BY a.start_time LIMIT 1;
    IF FOUND THEN
      SELECT name INTO v_name FROM public.rooms WHERE id = p_room_id;
      v_when := to_char(v_row.start_time AT TIME ZONE tz, 'DD/MM/YYYY') || ', das '
        || to_char(v_row.start_time AT TIME ZONE tz, 'HH24:MI') || ' às ' || to_char(v_row.end_time AT TIME ZONE tz, 'HH24:MI');
      RETURN 'A sala ' || COALESCE(v_name, 'escolhida') || ' já está ocupada em ' || v_when
        || COALESCE(' (atendimento de ' || v_row.pname || ')', '') || '. Escolha outra sala ou outro horário.';
    END IF;
  END IF;

  IF p_equipment_id IS NOT NULL THEN
    SELECT a.start_time, a.end_time, p.name AS pname INTO v_row FROM public.appointments a
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    LEFT JOIN public.professionals p ON p.id = a.professional_id
    WHERE a.equipment_id = p_equipment_id
      AND a.status NOT IN ('cancelled','missed','rescheduled')
      AND (p_id IS NULL OR a.id <> p_id) AND a.start_time < p_end AND a.end_time > p_start
      AND (v_skip_package IS NULL OR pa.package_id IS DISTINCT FROM v_skip_package)
    ORDER BY a.start_time LIMIT 1;
    IF FOUND THEN
      SELECT name INTO v_name FROM public.equipment WHERE id = p_equipment_id;
      v_when := to_char(v_row.start_time AT TIME ZONE tz, 'DD/MM/YYYY') || ', das '
        || to_char(v_row.start_time AT TIME ZONE tz, 'HH24:MI') || ' às ' || to_char(v_row.end_time AT TIME ZONE tz, 'HH24:MI');
      RETURN 'O equipamento ' || COALESCE(v_name, 'escolhido') || ' já está em uso em ' || v_when
        || COALESCE(' (atendimento de ' || v_row.pname || ')', '') || '. Escolha outro equipamento ou outro horário.';
    END IF;
  END IF;

  IF p_professional_id IS NOT NULL THEN
    SELECT ab.start_time, ab.end_time INTO v_row FROM public.professional_absences ab
    WHERE ab.professional_id = p_professional_id AND ab.start_time < p_end AND ab.end_time > p_start LIMIT 1;
    IF FOUND THEN
      SELECT name INTO v_name FROM public.professionals WHERE id = p_professional_id;
      RETURN COALESCE(v_name, 'O profissional') || ' está ausente de '
        || to_char(v_row.start_time AT TIME ZONE tz, 'DD/MM/YYYY HH24:MI') || ' até '
        || to_char(v_row.end_time AT TIME ZONE tz, 'DD/MM/YYYY HH24:MI') || '. Escolha outra data ou outro profissional.';
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;