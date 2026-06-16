CREATE OR REPLACE FUNCTION public.hard_purge_service_package(_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _owner uuid;
  _appt_ids uuid[] := ARRAY[]::uuid[];
  _sale_ids uuid[] := ARRAY[]::uuid[];
  _deleted_appts int := 0;
  _deleted_pkg_appts int := 0;
  _deleted_sales int := 0;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT account_owner_id INTO _owner
  FROM public.service_packages
  WHERE id = _package_id;

  IF _owner IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_deleted', true);
  END IF;

  IF NOT (
    _owner = _caller
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _caller AND p.account_owner_id = _owner)
    OR public.can_access_service_package(_package_id)
  ) THEN
    RAISE EXCEPTION 'forbidden: package belongs to another account';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT pa.appointment_id) FILTER (WHERE pa.appointment_id IS NOT NULL), ARRAY[]::uuid[])
    INTO _appt_ids
  FROM public.package_appointments pa
  WHERE pa.package_id = _package_id;

  SELECT COALESCE(array_agg(DISTINCT ss.id), ARRAY[]::uuid[])
    INTO _sale_ids
  FROM public.single_sales ss
  WHERE ss.package_id = _package_id;

  IF array_length(_appt_ids, 1) IS NOT NULL THEN
    UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
    UPDATE public.product_daily_consumption SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
    UPDATE public.treatment_photos SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
    UPDATE public.client_services SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
    UPDATE public.whatsapp_send_queue SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.client_credit_transactions WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.package_appointment_history WHERE appointment_id = ANY(_appt_ids);

    WITH d AS (DELETE FROM public.appointments WHERE id = ANY(_appt_ids) RETURNING 1)
    SELECT count(*) INTO _deleted_appts FROM d;
  END IF;

  SELECT count(*) INTO _deleted_pkg_appts
  FROM public.package_appointments
  WHERE package_id = _package_id;

  DELETE FROM public.package_appointment_history WHERE package_id = _package_id;
  DELETE FROM public.boleto_installments WHERE sale_id = ANY(_sale_ids);
  UPDATE public.cash_transactions SET reference_id = NULL WHERE reference_id = ANY(_sale_ids) AND reference_type = 'package_refund';
  UPDATE public.client_credit_transactions SET sale_id = NULL WHERE sale_id = ANY(_sale_ids);
  UPDATE public.payments_audit SET single_sale_id = NULL WHERE single_sale_id = ANY(_sale_ids);
  UPDATE public.cash_register_entries SET single_sale_id = NULL WHERE single_sale_id = ANY(_sale_ids);

  DELETE FROM public.package_appointments WHERE package_id = _package_id;

  WITH d AS (DELETE FROM public.single_sales WHERE id = ANY(_sale_ids) RETURNING 1)
  SELECT count(*) INTO _deleted_sales FROM d;

  DELETE FROM public.service_packages WHERE id = _package_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_appointments', _deleted_appts,
    'deleted_package_sessions', _deleted_pkg_appts,
    'deleted_sales', _deleted_sales
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hard_purge_service_package(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hard_purge_service_package(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_inactive_client_package_artifacts(
  _client_id uuid DEFAULT NULL,
  _account_owner_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _owner uuid;
  _pkg_ids uuid[] := ARRAY[]::uuid[];
  _sale_ids uuid[] := ARRAY[]::uuid[];
  _deleted_packages int := 0;
  _deleted_sessions int := 0;
  _deleted_sales int := 0;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  _owner := COALESCE(_account_owner_id, _caller);
  IF NOT (_owner = _caller OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _caller AND p.account_owner_id = _owner)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT sp.id), ARRAY[]::uuid[])
    INTO _pkg_ids
  FROM public.service_packages sp
  WHERE sp.account_owner_id = _owner
    AND (_client_id IS NULL OR sp.client_id = _client_id)
    AND (
      sp.is_active = false
      OR EXISTS (
        SELECT 1 FROM public.single_sales ss
        WHERE ss.package_id = sp.id
          AND COALESCE(ss.notes, '') ILIKE '%CANCELADO%'
      )
    );

  IF array_length(_pkg_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted_packages', 0, 'deleted_sessions', 0, 'deleted_sales', 0);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ss.id), ARRAY[]::uuid[])
    INTO _sale_ids
  FROM public.single_sales ss
  WHERE ss.package_id = ANY(_pkg_ids);

  DELETE FROM public.package_appointment_history WHERE package_id = ANY(_pkg_ids);
  DELETE FROM public.boleto_installments WHERE sale_id = ANY(_sale_ids);
  UPDATE public.cash_transactions SET reference_id = NULL WHERE reference_id = ANY(_sale_ids) AND reference_type = 'package_refund';
  UPDATE public.client_credit_transactions SET sale_id = NULL WHERE sale_id = ANY(_sale_ids);
  UPDATE public.payments_audit SET single_sale_id = NULL WHERE single_sale_id = ANY(_sale_ids);
  UPDATE public.cash_register_entries SET single_sale_id = NULL WHERE single_sale_id = ANY(_sale_ids);

  WITH d AS (DELETE FROM public.package_appointments WHERE package_id = ANY(_pkg_ids) RETURNING 1)
  SELECT count(*) INTO _deleted_sessions FROM d;

  WITH d AS (DELETE FROM public.single_sales WHERE id = ANY(_sale_ids) RETURNING 1)
  SELECT count(*) INTO _deleted_sales FROM d;

  WITH d AS (DELETE FROM public.service_packages WHERE id = ANY(_pkg_ids) RETURNING 1)
  SELECT count(*) INTO _deleted_packages FROM d;

  RETURN jsonb_build_object('ok', true, 'deleted_packages', _deleted_packages, 'deleted_sessions', _deleted_sessions, 'deleted_sales', _deleted_sales);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_inactive_client_package_artifacts(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_inactive_client_package_artifacts(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_orphan_cancelled_appointments(
  _client_id uuid DEFAULT NULL,
  _account_owner_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _owner uuid;
  _appt_ids uuid[] := ARRAY[]::uuid[];
  _deleted int := 0;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  _owner := COALESCE(_account_owner_id, _caller);
  IF NOT (_owner = _caller OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _caller AND p.account_owner_id = _owner)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _appt_ids
  FROM public.appointments a
  WHERE a.account_owner_id = _owner
    AND a.package_appointment_id IS NULL
    AND (
      (a.status = 'cancelled' AND a.notes ILIKE 'Pacote cancelado%')
      OR EXISTS (
        SELECT 1 FROM public.service_packages sp
        WHERE sp.client_id = a.client_id
          AND sp.account_owner_id = _owner
          AND sp.is_active = false
          AND a.notes IS NOT NULL
          AND lower(a.notes) LIKE '%' || lower(sp.name) || '%'
      )
    )
    AND (_client_id IS NULL OR a.client_id = _client_id);

  IF array_length(_appt_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', 0);
  END IF;

  UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
  UPDATE public.product_daily_consumption SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
  UPDATE public.treatment_photos SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
  UPDATE public.client_services SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
  UPDATE public.whatsapp_send_queue SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_edit_locks WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.client_credit_transactions WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.package_appointment_history WHERE appointment_id = ANY(_appt_ids);

  WITH d AS (DELETE FROM public.appointments WHERE id = ANY(_appt_ids) RETURNING 1)
  SELECT count(*) INTO _deleted FROM d;

  RETURN jsonb_build_object('ok', true, 'deleted', _deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_orphan_cancelled_appointments(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_orphan_cancelled_appointments(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_sync_package_appointment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pa record;
  v_service_id uuid;
BEGIN
  IF NEW.package_appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pa.*, sp.client_id, sp.is_active
    INTO v_pa
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE pa.id = NEW.package_appointment_id;

  IF NOT FOUND OR v_pa.is_active = false THEN
    NEW.package_appointment_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.client_id IS DISTINCT FROM v_pa.client_id THEN
    RAISE EXCEPTION 'A sessão do pacote não pertence ao cliente deste agendamento.';
  END IF;

  v_service_id := COALESCE(v_pa.service_id, public.resolve_service_id_for_package(v_pa.package_id, COALESCE(v_pa.sequence_order, v_pa.session_number)));
  IF NEW.service_id IS NULL AND v_service_id IS NOT NULL THEN
    NEW.service_id := v_service_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_package_appointment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pa_id uuid;
  v_package_id uuid;
  v_new_status text;
  v_mode text;
BEGIN
  v_pa_id := NEW.package_appointment_id;
  IF v_pa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pa.package_id INTO v_package_id
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE pa.id = v_pa_id AND sp.is_active = true;

  IF v_package_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_mode := NULLIF(current_setting('app.package_outcome_mode', true), '');

  IF v_mode = 'release' THEN
    UPDATE public.package_appointments pa
    SET appointment_id = NULL,
        scheduled_date = NULL,
        status = 'pending',
        updated_at = now()
    WHERE pa.id = v_pa_id
    RETURNING pa.package_id INTO v_package_id;
    PERFORM public.recount_service_package_sessions(v_package_id);
    RETURN NEW;
  END IF;

  IF v_mode = 'consume' THEN
    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'missed'
      WHEN 'rescheduled' THEN 'missed'
      ELSE 'scheduled'
    END;
  ELSE
    IF NEW.status::text IN ('cancelled', 'rescheduled') THEN
      UPDATE public.package_appointments pa
      SET appointment_id = NULL,
          scheduled_date = NULL,
          status = 'pending',
          updated_at = now()
      WHERE pa.id = v_pa_id
      RETURNING pa.package_id INTO v_package_id;
      PERFORM public.recount_service_package_sessions(v_package_id);
      RETURN NEW;
    END IF;

    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'confirmed' THEN 'scheduled'
      WHEN 'scheduled' THEN 'scheduled'
      ELSE 'scheduled'
    END;
  END IF;

  UPDATE public.package_appointments pa
  SET appointment_id = NEW.id,
      status = v_new_status,
      scheduled_date = NEW.start_time,
      updated_at = now()
  WHERE pa.id = v_pa_id
    AND (
      pa.appointment_id IS DISTINCT FROM NEW.id
      OR pa.status IS DISTINCT FROM v_new_status
      OR pa.scheduled_date IS DISTINCT FROM NEW.start_time
    )
  RETURNING pa.package_id INTO v_package_id;

  PERFORM public.recount_service_package_sessions(COALESCE(v_package_id, (SELECT package_id FROM public.package_appointments WHERE id = v_pa_id)));
  RETURN NEW;
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
  v_purged jsonb := '{}'::jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = _client_id
      AND (c.account_owner_id IS NULL OR c.account_owner_id = auth.uid()
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_owner_id = c.account_owner_id))
  ) THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Sem permissão para ajustar este cliente';
    END IF;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT public.purge_inactive_client_package_artifacts(_client_id) INTO v_purged;
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
  JOIN public.service_packages sp ON sp.id = pa.package_id AND sp.is_active = true
  WHERE a.client_id = _client_id AND a.package_appointment_id = pa.id AND a.service_id IS NULL;
  GET DIAGNOSTICS v_service_fixed = ROW_COUNT;

  UPDATE public.package_appointments pa
  SET status = CASE WHEN a.status IN ('completed','missed') THEN a.status::text ELSE 'scheduled' END,
      scheduled_date = a.start_time,
      updated_at = now()
  FROM public.appointments a
  JOIN public.service_packages sp ON sp.id = pa.package_id AND sp.is_active = true
  WHERE a.client_id = _client_id
    AND a.package_appointment_id = pa.id
    AND pa.appointment_id = a.id
    AND (pa.scheduled_date IS DISTINCT FROM a.start_time OR pa.status IS DISTINCT FROM CASE WHEN a.status IN ('completed','missed') THEN a.status::text ELSE 'scheduled' END);

  RETURN jsonb_build_object('clientId', _client_id, 'linkedAppointments', v_fixed, 'serviceFieldsFixed', v_service_fixed, 'purgedInactive', v_purged);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_service_packages_owner_client_active
ON public.service_packages(account_owner_id, client_id, is_active);

CREATE INDEX IF NOT EXISTS idx_single_sales_package_notes
ON public.single_sales(package_id);