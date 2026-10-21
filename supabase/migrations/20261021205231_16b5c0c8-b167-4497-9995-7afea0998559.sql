ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS price_snapshot numeric;

-- Backfill: copia dados dos serviços referenciados para as etapas antigas (uma única vez)
UPDATE public.services k
   SET service_components = sub.comps
  FROM (
    SELECT k2.id,
      jsonb_agg(
        c.elem
        || jsonb_build_object(
          'step_name', COALESCE(NULLIF(c.elem->>'step_name',''), s.name, 'Etapa ' || c.ord),
          'duration_minutes', COALESCE(NULLIF(c.elem->>'duration_minutes','')::int, s.duration, 60),
          'price', COALESCE(NULLIF(c.elem->>'price','')::numeric, s.price, 0),
          'professional_id', COALESCE(NULLIF(c.elem->>'professional_id',''), s.professional_id::text, k2.professional_id::text),
          'room_id', COALESCE(NULLIF(c.elem->>'room_id',''), s.room_id::text, k2.room_id::text),
          'equipment', COALESCE(c.elem->'equipment', to_jsonb(COALESCE(s.equipment, '{}'::text[])))
        ) ORDER BY c.ord) AS comps
    FROM public.services k2
    CROSS JOIN LATERAL jsonb_array_elements(k2.service_components) WITH ORDINALITY AS c(elem, ord)
    LEFT JOIN public.services s ON s.id = NULLIF(c.elem->>'service_id','')::uuid
    WHERE jsonb_typeof(k2.service_components) = 'array' AND jsonb_array_length(k2.service_components) > 0
    GROUP BY k2.id
  ) sub
 WHERE sub.id = k.id;

CREATE OR REPLACE FUNCTION public.validate_kit_steps()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c jsonb; i int := 0; v_has_rooms boolean; v_name text;
BEGIN
  IF NEW.service_components IS NULL OR jsonb_typeof(NEW.service_components) <> 'array'
     OR jsonb_array_length(NEW.service_components) = 0 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.service_components IS NOT DISTINCT FROM OLD.service_components THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (SELECT 1 FROM rooms r WHERE r.account_owner_id = NEW.account_owner_id AND r.is_active)
    INTO v_has_rooms;
  FOR c IN SELECT * FROM jsonb_array_elements(NEW.service_components) LOOP
    i := i + 1;
    v_name := btrim(COALESCE(c->>'step_name',''));
    IF v_name = '' THEN RAISE EXCEPTION 'Informe o nome da etapa %.', i USING ERRCODE='23514'; END IF;
    IF COALESCE(NULLIF(c->>'duration_minutes','')::int, 0) < 5 OR (c->>'duration_minutes')::int > 1440 THEN
      RAISE EXCEPTION 'Informe a duração da etapa "%".', v_name USING ERRCODE='23514'; END IF;
    IF NULLIF(c->>'price','') IS NULL OR (c->>'price')::numeric < 0 THEN
      RAISE EXCEPTION 'Informe o valor da etapa "%".', v_name USING ERRCODE='23514'; END IF;
    IF NULLIF(c->>'professional_id','') IS NULL THEN
      RAISE EXCEPTION 'Informe o profissional da etapa "%".', v_name USING ERRCODE='23514'; END IF;
    IF v_has_rooms AND NULLIF(c->>'room_id','') IS NULL THEN
      RAISE EXCEPTION 'Informe a sala da etapa "%".', v_name USING ERRCODE='23514'; END IF;
    IF COALESCE(NULLIF(c->>'interval_days','')::int, 0) < 0 THEN
      RAISE EXCEPTION 'Intervalo inválido na etapa "%".', v_name USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_kit_steps ON public.services;
CREATE TRIGGER trg_validate_kit_steps BEFORE INSERT OR UPDATE OF service_components ON public.services
FOR EACH ROW EXECUTE FUNCTION public.validate_kit_steps();
REVOKE ALL ON FUNCTION public.validate_kit_steps() FROM PUBLIC, anon, authenticated;

-- Criação atômica do kit gravando valor e nome da etapa
CREATE OR REPLACE FUNCTION public.create_composite_kit_appointments(p_client_id uuid, p_items jsonb, p_group_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE
  v_group uuid := COALESCE(p_group_id, gen_random_uuid());
  v_item jsonb; v_idx int := 0; v_start timestamptz; v_end timestamptz;
  v_reason text; v_id uuid; v_ids uuid[] := '{}'; v_existing uuid[]; v_label text;
BEGIN
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Selecione o cliente antes de salvar o kit.'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Nenhuma etapa do kit foi informada.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_group::text));
  SELECT array_agg(a.id ORDER BY a.composite_sequence_order) INTO v_existing
    FROM public.appointments a WHERE a.composite_group_id = v_group;
  IF v_existing IS NOT NULL AND array_length(v_existing, 1) > 0 THEN
    RETURN jsonb_build_object('composite_group_id', v_group, 'appointment_ids', to_jsonb(v_existing),
      'count', array_length(v_existing, 1), 'already_created', true);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    v_start := NULLIF(v_item->>'start_time', '')::timestamptz;
    v_end := NULLIF(v_item->>'end_time', '')::timestamptz;
    v_label := COALESCE(NULLIF(v_item->>'service_name_snapshot', ''), 'Etapa ' || v_idx::text);
    IF v_start IS NULL OR v_end IS NULL THEN RAISE EXCEPTION '% (etapa % do kit) está sem data ou horário.', v_label, v_idx; END IF;
    IF v_end <= v_start THEN RAISE EXCEPTION '% (etapa % do kit) está com duração inválida.', v_label, v_idx; END IF;
    IF NULLIF(v_item->>'professional_id', '') IS NULL THEN RAISE EXCEPTION '% (etapa % do kit) está sem profissional.', v_label, v_idx; END IF;

    v_reason := public.appointment_conflict_reason(NULL,
      NULLIF(v_item->>'professional_id', '')::uuid, NULLIF(v_item->>'room_id', '')::uuid,
      NULLIF(v_item->>'equipment_id', '')::uuid, v_start, v_end, 'scheduled');
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%: %', v_label, v_reason; END IF;

    INSERT INTO public.appointments (
      client_id, service_id, professional_id, room_id, equipment_id, start_time, end_time, status,
      payment_status, notes, discount_amount, service_name_snapshot, price_snapshot,
      composite_group_id, composite_sequence_order, created_by, updated_by
    ) VALUES (
      p_client_id, NULLIF(v_item->>'service_id', '')::uuid, NULLIF(v_item->>'professional_id', '')::uuid,
      NULLIF(v_item->>'room_id', '')::uuid, NULLIF(v_item->>'equipment_id', '')::uuid, v_start, v_end, 'scheduled',
      COALESCE(NULLIF(v_item->>'payment_status', ''), 'pending'), NULLIF(v_item->>'notes', ''),
      COALESCE(NULLIF(v_item->>'discount_amount', '')::numeric, 0), NULLIF(v_item->>'service_name_snapshot', ''),
      NULLIF(v_item->>'price', '')::numeric,
      v_group, COALESCE(NULLIF(v_item->>'sequence_order', '')::int, v_idx), auth.uid(), auth.uid()
    ) RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;

  RETURN jsonb_build_object('composite_group_id', v_group, 'appointment_ids', to_jsonb(v_ids),
    'count', COALESCE(array_length(v_ids, 1), 0), 'already_created', false);
END;
$function$;