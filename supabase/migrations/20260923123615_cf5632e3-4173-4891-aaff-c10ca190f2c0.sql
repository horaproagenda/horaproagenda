CREATE OR REPLACE FUNCTION public.appointment_conflict_reasons(p_slots jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slot jsonb;
  v_idx int := 0;
  v_reason text;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    v_reason := public.appointment_conflict_reason(
      NULLIF(v_slot->>'id', '')::uuid,
      NULLIF(v_slot->>'professional_id', '')::uuid,
      NULLIF(v_slot->>'room_id', '')::uuid,
      NULLIF(v_slot->>'equipment_id', '')::uuid,
      (v_slot->>'start')::timestamptz,
      (v_slot->>'end')::timestamptz,
      COALESCE(NULLIF(v_slot->>'status', ''), 'scheduled')
    );

    v_result := v_result || jsonb_build_object('index', v_idx, 'reason', v_reason);
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.appointment_conflict_reasons(jsonb) TO authenticated;
