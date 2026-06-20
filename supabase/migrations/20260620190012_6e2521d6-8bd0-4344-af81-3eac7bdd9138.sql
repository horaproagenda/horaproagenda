
CREATE OR REPLACE FUNCTION public.rebuild_package_appointments(_package_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer;
  _account_owner uuid;
  _service_id uuid;
  _interval integer;
  _row record;
  _seq integer := 0;
BEGIN
  IF _package_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT total_sessions, account_owner_id, service_id, COALESCE(interval_days, 0)
    INTO _total, _account_owner, _service_id, _interval
  FROM public.service_packages
  WHERE id = _package_id;

  IF _total IS NULL OR _total <= 0 THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
  PERFORM set_config('app.skip_rebuild_pa', '1', true);

  DELETE FROM public.package_appointments pa
  WHERE pa.package_id = _package_id
    AND pa.appointment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.package_appointments pa2
      WHERE pa2.package_id = pa.package_id
        AND pa2.appointment_id = pa.appointment_id
        AND pa2.id <> pa.id
        AND pa2.created_at >= pa.created_at
    );

  UPDATE public.package_appointments pa
     SET appointment_id = NULL, scheduled_date = NULL, status = 'pending', updated_at = now()
   WHERE pa.package_id = _package_id
     AND pa.appointment_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.appointments a
        WHERE a.id = pa.appointment_id
          AND a.status IN ('cancelled', 'rescheduled')
     );

  _seq := 0;
  FOR _row IN
    SELECT pa.id, a.start_time, a.status::text AS appt_status
    FROM public.package_appointments pa
    JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.package_id = _package_id
      AND a.status NOT IN ('cancelled', 'rescheduled')
    ORDER BY a.start_time ASC, pa.created_at ASC
  LOOP
    _seq := _seq + 1;
    UPDATE public.package_appointments
       SET session_number = _seq,
           sequence_order = _seq,
           original_session_number = COALESCE(original_session_number, _seq),
           scheduled_date = _row.start_time,
           status = _row.appt_status,
           updated_at = now()
     WHERE id = _row.id;
  END LOOP;

  FOR _row IN
    SELECT pa.id
    FROM public.package_appointments pa
    WHERE pa.package_id = _package_id
      AND pa.appointment_id IS NULL
    ORDER BY pa.created_at ASC, pa.id ASC
  LOOP
    _seq := _seq + 1;
    IF _seq > _total THEN
      DELETE FROM public.package_appointments WHERE id = _row.id;
      _seq := _seq - 1;
      CONTINUE;
    END IF;
    UPDATE public.package_appointments
       SET session_number = _seq,
           sequence_order = _seq,
           original_session_number = COALESCE(original_session_number, _seq),
           scheduled_date = NULL,
           status = 'pending',
           updated_at = now()
     WHERE id = _row.id;
  END LOOP;

  WHILE _seq < _total LOOP
    _seq := _seq + 1;
    INSERT INTO public.package_appointments (
      package_id, appointment_id, session_number, original_session_number,
      sequence_order, interval_after_days, scheduled_date, status,
      service_id, account_owner_id
    ) VALUES (
      _package_id, NULL, _seq, _seq, _seq, _interval, NULL, 'pending',
      _service_id, _account_owner
    );
  END LOOP;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);

  PERFORM public.recount_service_package_sessions(_package_id);

  RETURN _seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_package_appointments(uuid) TO authenticated, service_role;

DO $$
DECLARE
  _pkg record;
BEGIN
  FOR _pkg IN SELECT id FROM public.service_packages WHERE is_active = true LOOP
    PERFORM public.rebuild_package_appointments(_pkg.id);
  END LOOP;
END;
$$;
