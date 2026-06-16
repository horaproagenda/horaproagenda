CREATE OR REPLACE FUNCTION public.resolve_service_id_for_package(_package_id uuid, _sequence_order integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id uuid;
  v_pkg record;
BEGIN
  SELECT id, service_id, template_id, name, account_owner_id
  INTO v_pkg
  FROM public.service_packages
  WHERE id = _package_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_pkg.service_id IS NOT NULL THEN
    RETURN v_pkg.service_id;
  END IF;

  IF v_pkg.template_id IS NOT NULL AND _sequence_order IS NOT NULL THEN
    SELECT pts.service_id
    INTO v_service_id
    FROM public.package_template_steps pts
    WHERE pts.template_id = v_pkg.template_id
      AND pts.service_id IS NOT NULL
      AND pts.sequence_order = _sequence_order
    LIMIT 1;
    IF v_service_id IS NOT NULL THEN RETURN v_service_id; END IF;
  END IF;

  IF v_pkg.template_id IS NOT NULL THEN
    SELECT pts.service_id INTO v_service_id
    FROM public.package_template_steps pts
    WHERE pts.template_id = v_pkg.template_id AND pts.service_id IS NOT NULL
    ORDER BY pts.sequence_order LIMIT 1;
    IF v_service_id IS NOT NULL THEN RETURN v_service_id; END IF;
  END IF;

  SELECT s.id INTO v_service_id
  FROM public.services s
  WHERE s.is_active = true
    AND (v_pkg.account_owner_id IS NULL OR s.account_owner_id = v_pkg.account_owner_id)
    AND lower(s.name) = lower(v_pkg.name)
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_service_id IS NOT NULL THEN RETURN v_service_id; END IF;

  SELECT s.id INTO v_service_id
  FROM public.services s
  WHERE s.is_active = true
    AND (v_pkg.account_owner_id IS NULL OR s.account_owner_id = v_pkg.account_owner_id)
    AND (lower(s.name) LIKE '%' || lower(v_pkg.name) || '%' OR lower(v_pkg.name) LIKE '%' || lower(s.name) || '%')
  ORDER BY length(s.name), s.created_at DESC LIMIT 1;

  RETURN v_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.heal_package_service_links(_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  v_fallback_service_id := public.resolve_service_id_for_package(_package_id, NULL);

  IF v_pkg.service_id IS NULL AND v_fallback_service_id IS NOT NULL THEN
    UPDATE public.service_packages SET service_id = v_fallback_service_id, updated_at = now()
    WHERE id = _package_id AND service_id IS NULL;
    GET DIAGNOSTICS v_package_rows = ROW_COUNT;
  END IF;

  UPDATE public.package_appointments pa
  SET service_id = COALESCE(pa.service_id, public.resolve_service_id_for_package(pa.package_id, COALESCE(pa.sequence_order, pa.session_number)), v_fallback_service_id),
      updated_at = now()
  WHERE pa.package_id = _package_id AND pa.service_id IS NULL;
  GET DIAGNOSTICS v_session_rows = ROW_COUNT;

  UPDATE public.appointments a
  SET service_id = COALESCE(a.service_id, pa.service_id, v_fallback_service_id), updated_at = now()
  FROM public.package_appointments pa
  WHERE pa.package_id = _package_id AND a.package_appointment_id = pa.id AND a.service_id IS NULL;
  GET DIAGNOSTICS v_appointment_rows = ROW_COUNT;

  RETURN jsonb_build_object('packageId', _package_id, 'packageServiceFixed', v_package_rows, 'sessionServicesFixed', v_session_rows, 'appointmentServicesFixed', v_appointment_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_package_session_to_appointment(_package_id uuid, _appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pkg record;
  v_appt record;
  v_pa record;
  v_service_id uuid;
  v_package_paid numeric := 0;
  v_package_methods text[] := ARRAY[]::text[];
  v_package_status text := 'pending';
BEGIN
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote não encontrado'; END IF;
  IF NOT public.can_access_service_package(_package_id) THEN
    RAISE EXCEPTION 'Sem permissão para usar este pacote';
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
  IF v_appt.client_id IS DISTINCT FROM v_pkg.client_id THEN
    RAISE EXCEPTION 'O agendamento não pertence ao cliente do pacote';
  END IF;

  PERFORM public.heal_package_service_links(_package_id);

  SELECT * INTO v_pa
  FROM public.package_appointments
  WHERE package_id = _package_id
    AND (appointment_id = _appointment_id OR (appointment_id IS NULL AND status IN ('pending','scheduled')))
  ORDER BY
    CASE WHEN appointment_id = _appointment_id THEN 0 ELSE 1 END,
    CASE WHEN scheduled_date IS NOT NULL THEN abs(extract(epoch from (scheduled_date - v_appt.start_time))) ELSE 999999999 END,
    COALESCE(sequence_order, session_number)
  LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Não há sessões disponíveis neste pacote'; END IF;

  v_service_id := COALESCE(v_pa.service_id, public.resolve_service_id_for_package(_package_id, COALESCE(v_pa.sequence_order, v_pa.session_number)));

  SELECT COALESCE(max(a.amount_paid), 0) INTO v_package_paid
  FROM public.package_appointments pa
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.package_id = _package_id;

  SELECT COALESCE(array_agg(DISTINCT method), ARRAY[]::text[]) INTO v_package_methods
  FROM (
    SELECT unnest(COALESCE(v_pkg.payment_methods, ARRAY[]::text[])) AS method
    UNION
    SELECT unnest(COALESCE(a.payment_methods, ARRAY[]::text[])) AS method
    FROM public.package_appointments pa JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.package_id = _package_id
  ) methods WHERE method IS NOT NULL AND method <> '';

  v_package_status := CASE
    WHEN COALESCE(v_pkg.total_price, 0) > 0 AND v_package_paid >= COALESCE(v_pkg.total_price, 0) THEN 'paid'
    WHEN v_package_paid > 0 OR cardinality(v_package_methods) > 0 THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE public.package_appointments
  SET appointment_id = _appointment_id,
      status = CASE WHEN v_appt.status IN ('completed','missed','cancelled','rescheduled') THEN v_appt.status::text ELSE 'scheduled' END,
      scheduled_date = v_appt.start_time,
      service_id = v_service_id,
      updated_at = now()
  WHERE id = v_pa.id;

  UPDATE public.appointments
  SET package_appointment_id = v_pa.id,
      service_id = COALESCE(v_appt.service_id, v_service_id),
      payment_status = CASE WHEN v_appt.payment_status = 'paid' THEN v_appt.payment_status ELSE v_package_status END,
      amount_paid = GREATEST(COALESCE(v_appt.amount_paid, 0), COALESCE(v_package_paid, 0)),
      payment_methods = CASE WHEN cardinality(COALESCE(v_appt.payment_methods, ARRAY[]::text[])) > 0 THEN v_appt.payment_methods ELSE v_package_methods END,
      notes = CASE
        WHEN COALESCE(v_appt.notes, '') ~* 'Sessão\s+\d+\s+de\s+\d+' THEN v_appt.notes
        WHEN COALESCE(v_appt.notes, '') = '' OR lower(v_appt.notes) = lower(v_pkg.name)
          THEN v_pkg.name || ' - Sessão ' || v_pa.session_number || ' de ' || v_pkg.total_sessions
        ELSE v_pkg.name || ' - Sessão ' || v_pa.session_number || ' de ' || v_pkg.total_sessions || ' - ' || v_appt.notes
      END,
      updated_at = now()
  WHERE id = _appointment_id;

  UPDATE public.service_packages sp
  SET sessions_scheduled = sub.scheduled_count, updated_at = now()
  FROM (
    SELECT package_id, count(*)::integer AS scheduled_count
    FROM public.package_appointments
    WHERE package_id = _package_id AND appointment_id IS NOT NULL AND status <> 'cancelled'
    GROUP BY package_id
  ) sub WHERE sp.id = sub.package_id;

  RETURN jsonb_build_object('packageAppointmentId', v_pa.id, 'sessionNumber', v_pa.session_number, 'totalSessions', v_pkg.total_sessions, 'serviceId', v_service_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.heal_client_package_appointments(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_fixed integer := 0;
  v_service_fixed integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id
      AND (c.account_owner_id IS NULL OR c.account_owner_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_owner_id = c.account_owner_id))
  ) THEN
    -- service-role bypass: if no auth context, allow (called inside DO block during migration)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Sem permissão para ajustar este cliente';
    END IF;
  END IF;

  FOR rec IN
    SELECT DISTINCT ON (a.id) a.id AS appointment_id, sp.id AS package_id
    FROM public.appointments a
    JOIN public.service_packages sp
      ON sp.client_id = a.client_id AND sp.is_active = true
    JOIN public.package_appointments pa
      ON pa.package_id = sp.id AND pa.appointment_id IS NULL AND pa.status IN ('pending','scheduled')
     AND (pa.scheduled_date IS NULL OR abs(extract(epoch from (pa.scheduled_date - a.start_time))) <= 86400 * 14)
    WHERE a.client_id = _client_id
      AND a.package_appointment_id IS NULL
      AND a.status <> 'cancelled'
      AND a.notes IS NOT NULL
      AND lower(a.notes) LIKE '%' || lower(sp.name) || '%'
    ORDER BY a.id, a.start_time
  LOOP
    BEGIN
      PERFORM public.link_package_session_to_appointment(rec.package_id, rec.appointment_id);
      v_fixed := v_fixed + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  UPDATE public.appointments a
  SET service_id = COALESCE(a.service_id, pa.service_id, sp.service_id, public.resolve_service_id_for_package(sp.id, COALESCE(pa.sequence_order, pa.session_number))),
      updated_at = now()
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE a.client_id = _client_id AND a.package_appointment_id = pa.id AND a.service_id IS NULL;
  GET DIAGNOSTICS v_service_fixed = ROW_COUNT;

  RETURN jsonb_build_object('clientId', _client_id, 'linkedAppointments', v_fixed, 'serviceFieldsFixed', v_service_fixed);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fill_package_session_service()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.service_id IS NULL THEN
    NEW.service_id := public.resolve_service_id_for_package(NEW.package_id, COALESCE(NEW.sequence_order, NEW.session_number));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fill_package_session_service_before_write ON public.package_appointments;
CREATE TRIGGER fill_package_session_service_before_write
BEFORE INSERT OR UPDATE OF package_id, service_id, sequence_order, session_number
ON public.package_appointments FOR EACH ROW EXECUTE FUNCTION public.trg_fill_package_session_service();

CREATE OR REPLACE FUNCTION public.trg_sync_package_appointment_consistency()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_service_id uuid;
BEGIN
  IF NEW.package_appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(pa.service_id, public.resolve_service_id_for_package(pa.package_id, COALESCE(pa.sequence_order, pa.session_number)))
  INTO v_service_id FROM public.package_appointments pa WHERE pa.id = NEW.package_appointment_id;
  IF NEW.service_id IS NULL AND v_service_id IS NOT NULL THEN NEW.service_id := v_service_id; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sync_package_appointment_consistency_before_write ON public.appointments;
CREATE TRIGGER sync_package_appointment_consistency_before_write
BEFORE INSERT OR UPDATE OF package_appointment_id, service_id
ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.trg_sync_package_appointment_consistency();

CREATE INDEX IF NOT EXISTS idx_package_appointments_package_status_schedule
ON public.package_appointments(package_id, status, scheduled_date, sequence_order, session_number);

DO $$
DECLARE
  v_axila_service uuid;
BEGIN
  SELECT id INTO v_axila_service FROM public.services
  WHERE is_active = true AND name = 'Axila + Virilha Completa'
  ORDER BY created_at DESC LIMIT 1;

  IF v_axila_service IS NOT NULL THEN
    UPDATE public.service_packages SET service_id = v_axila_service, updated_at = now()
    WHERE id = '1a62154c-0ee9-459c-a889-d0254e222871'::uuid AND service_id IS NULL;

    UPDATE public.package_appointments SET service_id = v_axila_service, updated_at = now()
    WHERE package_id = '1a62154c-0ee9-459c-a889-d0254e222871'::uuid AND service_id IS NULL;
  END IF;

  PERFORM public.heal_client_package_appointments('04e58965-3851-4d45-8cae-42ddf14212fc'::uuid);
END $$;