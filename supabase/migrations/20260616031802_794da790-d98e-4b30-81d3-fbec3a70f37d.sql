
-- 1) Hard purge a service_package (and all its related rows) permanently.
CREATE OR REPLACE FUNCTION public.hard_purge_service_package(_package_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _owner uuid;
  _appt_ids uuid[];
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
    -- Already gone; idempotent
    RETURN jsonb_build_object('ok', true, 'already_deleted', true);
  END IF;

  IF _owner <> _caller THEN
    RAISE EXCEPTION 'forbidden: package belongs to another account';
  END IF;

  -- Collect linked appointment ids (via package_appointments)
  SELECT COALESCE(array_agg(DISTINCT pa.appointment_id) FILTER (WHERE pa.appointment_id IS NOT NULL), '{}')
    INTO _appt_ids
  FROM public.package_appointments pa
  WHERE pa.package_id = _package_id;

  -- Detach financial_entries from these appointments (preserve money records, drop link)
  IF array_length(_appt_ids, 1) IS NOT NULL THEN
    UPDATE public.financial_entries
      SET appointment_id = NULL
      WHERE appointment_id = ANY(_appt_ids);

    -- Delete dependent rows that should die with the appointment
    DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.client_services WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.treatment_photos WHERE appointment_id = ANY(_appt_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_appt_ids);

    -- Delete the appointments themselves
    WITH d AS (DELETE FROM public.appointments WHERE id = ANY(_appt_ids) RETURNING 1)
    SELECT count(*) INTO _deleted_appts FROM d;
  END IF;

  -- Count package_appointments before cascade
  SELECT count(*) INTO _deleted_pkg_appts
  FROM public.package_appointments WHERE package_id = _package_id;

  -- Delete package_appointment_history rows for this package's sessions (defensive; no FK cascade guaranteed)
  DELETE FROM public.package_appointment_history
    WHERE package_appointment_id IN (
      SELECT id FROM public.package_appointments WHERE package_id = _package_id
    );

  -- Detach single_sales (preserve sale record for audit; null its package link) OR delete? Keep but null.
  WITH d AS (
    UPDATE public.single_sales SET package_id = NULL WHERE package_id = _package_id RETURNING 1
  )
  SELECT count(*) INTO _deleted_sales FROM d;

  -- Finally delete the package (cascades package_appointments)
  DELETE FROM public.service_packages WHERE id = _package_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_appointments', _deleted_appts,
    'deleted_package_sessions', _deleted_pkg_appts,
    'detached_sales', _deleted_sales
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hard_purge_service_package(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hard_purge_service_package(uuid) TO authenticated;

-- 2) Purge orphan "Pacote cancelado" appointments (no package_appointment link, status cancelled).
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
  _appt_ids uuid[];
  _deleted int := 0;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  _owner := COALESCE(_account_owner_id, _caller);
  IF _owner <> _caller THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO _appt_ids
  FROM public.appointments a
  WHERE a.account_owner_id = _owner
    AND a.status = 'cancelled'
    AND a.package_appointment_id IS NULL
    AND a.notes ILIKE 'Pacote cancelado%'
    AND (_client_id IS NULL OR a.client_id = _client_id);

  IF array_length(_appt_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', 0);
  END IF;

  UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.client_services WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.treatment_photos WHERE appointment_id = ANY(_appt_ids);
  DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_appt_ids);

  WITH d AS (DELETE FROM public.appointments WHERE id = ANY(_appt_ids) RETURNING 1)
  SELECT count(*) INTO _deleted FROM d;

  RETURN jsonb_build_object('ok', true, 'deleted', _deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_orphan_cancelled_appointments(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_orphan_cancelled_appointments(uuid, uuid) TO authenticated;

-- 3) Immediate cleanup of the 4 known orphans for Luiza + any other orphans across all accounts.
DO $$
DECLARE
  _ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), '{}') INTO _ids
  FROM public.appointments
  WHERE status = 'cancelled'
    AND package_appointment_id IS NULL
    AND notes ILIKE 'Pacote cancelado%';

  IF array_length(_ids, 1) IS NOT NULL THEN
    UPDATE public.financial_entries SET appointment_id = NULL WHERE appointment_id = ANY(_ids);
    DELETE FROM public.appointment_additional_items WHERE appointment_id = ANY(_ids);
    DELETE FROM public.appointment_product_consumption WHERE appointment_id = ANY(_ids);
    DELETE FROM public.client_services WHERE appointment_id = ANY(_ids);
    DELETE FROM public.treatment_photos WHERE appointment_id = ANY(_ids);
    DELETE FROM public.appointment_reminder_log WHERE appointment_id = ANY(_ids);
    DELETE FROM public.appointments WHERE id = ANY(_ids);
  END IF;
END $$;
