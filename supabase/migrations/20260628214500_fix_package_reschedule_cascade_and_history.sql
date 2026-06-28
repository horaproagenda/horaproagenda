-- Corrige a cascata de reagendamento de pacotes e preserva o histórico detalhado
-- de sessões canceladas/reagendadas com nome de pacote/serviço consistente.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_name_snapshot text,
  ADD COLUMN IF NOT EXISTS package_name_snapshot text;

COMMENT ON COLUMN public.appointments.service_name_snapshot IS
  'Nome do serviço no momento do vínculo/atualização, usado para histórico quando o cadastro muda.';
COMMENT ON COLUMN public.appointments.package_name_snapshot IS
  'Nome do pacote no momento do vínculo/atualização, usado para histórico quando o cadastro muda.';

CREATE OR REPLACE FUNCTION public.fill_appointment_name_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_name text;
  v_package_name text;
BEGIN
  IF NEW.service_id IS NOT NULL THEN
    SELECT s.name INTO v_service_name
    FROM public.services s
    WHERE s.id = NEW.service_id;
  END IF;

  IF NEW.package_appointment_id IS NOT NULL THEN
    SELECT sp.name,
           COALESCE(svc.name, v_service_name)
      INTO v_package_name, v_service_name
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, NEW.service_id, sp.service_id)
    WHERE pa.id = NEW.package_appointment_id;
  END IF;

  NEW.service_name_snapshot := COALESCE(v_service_name, NULLIF(NEW.service_name_snapshot, ''), NEW.service_name_snapshot);
  NEW.package_name_snapshot := COALESCE(v_package_name, NULLIF(NEW.package_name_snapshot, ''), NEW.package_name_snapshot);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_appointment_name_snapshots_before_write ON public.appointments;
CREATE TRIGGER fill_appointment_name_snapshots_before_write
BEFORE INSERT OR UPDATE OF service_id, package_appointment_id, service_name_snapshot, package_name_snapshot
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.fill_appointment_name_snapshots();

-- A cascata agora recalcula a data exata das próximas aplicações a partir da
-- aplicação alterada (ex.: 30/06 + 21 dias = 21/07), e não apenas quando a data
-- seguinte viola o intervalo mínimo.
CREATE OR REPLACE FUNCTION public.recalculate_package_minimum_intervals(_package_appointment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_package_id uuid;
  v_package_interval integer;
  v_min_days integer := 21;
  v_started boolean := false;
  v_previous_start timestamptz := NULL;
  v_previous_interval integer := NULL;
  v_updates integer := 0;
  v_interval_from_previous integer;
  v_required_date date;
  v_target_time time;
  v_effective_start timestamptz;
  v_new_start timestamptz;
  v_duration interval;
  v_is_mutable boolean;
  v_is_inactive_history boolean;
  rec record;
BEGIN
  SELECT pa.package_id,
         GREATEST(v_min_days, COALESCE(NULLIF(sp.interval_days, 0), v_min_days))
    INTO v_package_id, v_package_interval
  FROM public.package_appointments pa
  JOIN public.service_packages sp ON sp.id = pa.package_id
  WHERE pa.id = _package_appointment_id;

  IF v_package_id IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.skip_package_interval_cascade', 'on', true);
  PERFORM set_config('app.skip_rebuild_pa', '1', true);

  FOR rec IN
    SELECT
      pa.id,
      pa.appointment_id,
      pa.scheduled_date,
      pa.status AS package_status,
      pa.interval_after_days,
      COALESCE(pa.sequence_order, pa.session_number) AS session_order,
      pa.created_at,
      a.start_time AS appointment_start_time,
      a.end_time AS appointment_end_time,
      a.status::text AS appointment_status,
      sp.duration AS package_duration,
      svc.duration AS service_duration
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    LEFT JOIN public.services svc ON svc.id = COALESCE(pa.service_id, a.service_id, sp.service_id)
    WHERE pa.package_id = v_package_id
    ORDER BY
      COALESCE(pa.sequence_order, pa.session_number),
      COALESCE(a.start_time, pa.scheduled_date),
      pa.created_at,
      pa.id
  LOOP
    v_effective_start := COALESCE(rec.appointment_start_time, rec.scheduled_date);
    v_new_start := v_effective_start;

    v_is_inactive_history := COALESCE(rec.package_status, 'pending') IN ('cancelled', 'rescheduled')
      OR COALESCE(rec.appointment_status, 'scheduled') IN ('cancelled', 'rescheduled');

    v_is_mutable := NOT v_is_inactive_history
      AND COALESCE(rec.package_status, 'scheduled') NOT IN ('completed', 'missed')
      AND COALESCE(rec.appointment_status, 'scheduled') NOT IN ('completed', 'missed');

    IF rec.id = _package_appointment_id THEN
      v_started := true;
    END IF;

    IF v_started AND rec.id <> _package_appointment_id AND v_previous_start IS NOT NULL THEN
      v_interval_from_previous := GREATEST(v_min_days, COALESCE(NULLIF(v_previous_interval, 0), v_package_interval, v_min_days));
      v_required_date := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::date + v_interval_from_previous;
      v_target_time := (v_previous_start AT TIME ZONE 'America/Sao_Paulo')::time;
      v_new_start := (v_required_date::timestamp + v_target_time) AT TIME ZONE 'America/Sao_Paulo';

      IF v_is_mutable AND v_new_start IS NOT NULL
         AND (v_effective_start IS NULL OR v_new_start IS DISTINCT FROM v_effective_start) THEN
        v_duration := CASE
          WHEN rec.appointment_start_time IS NOT NULL AND rec.appointment_end_time IS NOT NULL
            THEN rec.appointment_end_time - rec.appointment_start_time
          ELSE make_interval(mins => GREATEST(1, COALESCE(rec.service_duration, rec.package_duration, 60))::integer)
        END;

        UPDATE public.package_appointments
        SET scheduled_date = v_new_start,
            status = CASE WHEN status IN ('pending', 'rescheduled') THEN 'scheduled' ELSE status END,
            updated_at = now()
        WHERE id = rec.id
          AND (scheduled_date IS DISTINCT FROM v_new_start OR status IN ('pending', 'rescheduled'));

        IF rec.appointment_id IS NOT NULL THEN
          UPDATE public.appointments
          SET start_time = v_new_start,
              end_time = v_new_start + v_duration,
              status = CASE WHEN status = 'rescheduled' THEN 'scheduled' ELSE status END,
              updated_at = now()
          WHERE id = rec.appointment_id
            AND status::text NOT IN ('completed', 'missed', 'cancelled')
            AND (start_time IS DISTINCT FROM v_new_start OR end_time IS DISTINCT FROM v_new_start + v_duration OR status = 'rescheduled');
        END IF;

        v_effective_start := v_new_start;
        v_updates := v_updates + 1;
      END IF;
    END IF;

    -- Cancelados/reagendados históricos não devem empurrar a próxima aplicação.
    IF NOT v_is_inactive_history AND v_effective_start IS NOT NULL THEN
      v_previous_start := v_effective_start;
      v_previous_interval := rec.interval_after_days;
    END IF;
  END LOOP;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);

  RETURN v_updates;
END;
$$;

-- Rebuild sem apagar o vínculo histórico de agendamentos cancelados/reagendados.
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

  -- Sincroniza linhas históricas, sem liberar/desvincular: elas precisam aparecer
  -- no perfil do cliente com pacote/serviço corretos.
  UPDATE public.package_appointments pa
     SET scheduled_date = a.start_time,
         status = CASE a.status
           WHEN 'completed' THEN 'completed'
           WHEN 'missed' THEN 'missed'
           WHEN 'cancelled' THEN 'cancelled'
           WHEN 'rescheduled' THEN 'rescheduled'
           WHEN 'confirmed' THEN 'scheduled'
           WHEN 'scheduled' THEN 'scheduled'
           ELSE pa.status
         END,
         service_id = COALESCE(pa.service_id, a.service_id, public.resolve_service_id_for_package(pa.package_id, COALESCE(pa.sequence_order, pa.session_number))),
         updated_at = now()
    FROM public.appointments a
   WHERE pa.package_id = _package_id
     AND pa.appointment_id = a.id
     AND (pa.scheduled_date IS DISTINCT FROM a.start_time
       OR pa.status IS DISTINCT FROM CASE a.status
           WHEN 'completed' THEN 'completed'
           WHEN 'missed' THEN 'missed'
           WHEN 'cancelled' THEN 'cancelled'
           WHEN 'rescheduled' THEN 'rescheduled'
           WHEN 'confirmed' THEN 'scheduled'
           WHEN 'scheduled' THEN 'scheduled'
           ELSE pa.status
         END
       OR pa.service_id IS NULL);

  -- Renumera apenas aplicações ativas/consumidas; canceladas/reagendadas históricas
  -- preservam seu número original e não ocupam vaga ativa do pacote.
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
    ORDER BY COALESCE(pa.scheduled_date, pa.created_at + INTERVAL '100 years') ASC, pa.created_at ASC
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

CREATE OR REPLACE FUNCTION public.refresh_appointment_name_snapshots(_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH resolved AS (
    SELECT
      a.id,
      COALESCE(s.name, pa_svc.name, sp_svc.name, a.service_name_snapshot) AS new_service_name,
      COALESCE(sp.name, note_pkg.name, a.package_name_snapshot) AS new_package_name
    FROM public.appointments a
    JOIN public.clients c ON c.id = a.client_id
    LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
    LEFT JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.services s ON s.id = a.service_id
    LEFT JOIN public.services pa_svc ON pa_svc.id = pa.service_id
    LEFT JOIN public.services sp_svc ON sp_svc.id = sp.service_id
    LEFT JOIN LATERAL (
      SELECT sp2.name
      FROM public.service_packages sp2
      WHERE sp2.client_id = a.client_id
        AND a.notes IS NOT NULL
        AND lower(a.notes) LIKE '%' || lower(sp2.name) || '%'
      ORDER BY length(sp2.name) DESC, sp2.created_at DESC
      LIMIT 1
    ) note_pkg ON true
    WHERE (_client_id IS NULL OR a.client_id = _client_id)
      AND (
        auth.uid() IS NULL
        OR c.account_owner_id IS NULL
        OR c.account_owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_owner_id = c.account_owner_id)
      )
  )
  UPDATE public.appointments a
  SET service_name_snapshot = r.new_service_name,
      package_name_snapshot = r.new_package_name,
      updated_at = now()
  FROM resolved r
  WHERE a.id = r.id
    AND (
      a.service_name_snapshot IS DISTINCT FROM r.new_service_name
      OR a.package_name_snapshot IS DISTINCT FROM r.new_package_name
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updatedSnapshots', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_appointment_name_snapshots(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_client_package_schedule_and_history(_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_rebuilt integer := 0;
  v_recalculated integer := 0;
  v_updates integer := 0;
  v_cancelled jsonb := '{}'::jsonb;
  v_snapshots jsonb := '{}'::jsonb;
BEGIN
  IF _client_id IS NULL AND auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Informe um cliente para ajustar o histórico';
  END IF;

  IF _client_id IS NOT NULL AND auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = _client_id
      AND (
        c.account_owner_id IS NULL
        OR c.account_owner_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.account_owner_id = c.account_owner_id)
      )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ajustar este cliente';
  END IF;

  SELECT public.repair_package_cancelled_history(_client_id) INTO v_cancelled;

  FOR rec IN
    SELECT id
    FROM public.service_packages
    WHERE is_active = true
      AND (_client_id IS NULL OR client_id = _client_id)
    ORDER BY created_at ASC
  LOOP
    PERFORM public.rebuild_package_appointments(rec.id);
    v_rebuilt := v_rebuilt + 1;
  END LOOP;

  -- Recalcula a partir da última aplicação alterada/agendada de cada pacote.
  -- Isso preserva a data escolhida manualmente no reagendamento (ex.: 30/06)
  -- e corrige apenas as aplicações seguintes (ex.: 21/07), sem voltar a cadeia
  -- para datas antigas do pacote.
  FOR rec IN
    SELECT DISTINCT ON (pa.package_id) pa.id
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE sp.is_active = true
      AND (_client_id IS NULL OR sp.client_id = _client_id)
      AND (pa.appointment_id IS NOT NULL OR pa.scheduled_date IS NOT NULL)
      AND COALESCE(pa.status, 'pending') NOT IN ('cancelled', 'rescheduled', 'completed', 'missed')
      AND COALESCE(a.status::text, 'scheduled') NOT IN ('cancelled', 'rescheduled', 'completed', 'missed')
    ORDER BY
      pa.package_id,
      GREATEST(
        COALESCE(a.updated_at, a.created_at, 'epoch'::timestamptz),
        COALESCE(pa.updated_at, pa.created_at, 'epoch'::timestamptz)
      ) DESC,
      COALESCE(pa.sequence_order, pa.session_number) DESC,
      pa.id
  LOOP
    v_updates := public.recalculate_package_minimum_intervals(rec.id);
    v_recalculated := v_recalculated + COALESCE(v_updates, 0);
  END LOOP;

  SELECT public.refresh_appointment_name_snapshots(_client_id) INTO v_snapshots;

  RETURN jsonb_build_object(
    'rebuiltPackages', v_rebuilt,
    'rescheduledSessions', v_recalculated,
    'cancelledHistory', v_cancelled,
    'snapshots', v_snapshots
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_client_package_schedule_and_history(uuid) TO authenticated, service_role;

-- Backfill: nomes corretos e datas futuras consistentes para cadastros já existentes.
DO $$
DECLARE
  rec record;
BEGIN
  PERFORM public.refresh_appointment_name_snapshots(NULL);

  FOR rec IN SELECT id FROM public.service_packages WHERE is_active = true ORDER BY created_at ASC LOOP
    PERFORM public.rebuild_package_appointments(rec.id);
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ON (pa.package_id) pa.id
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE sp.is_active = true
      AND (pa.appointment_id IS NOT NULL OR pa.scheduled_date IS NOT NULL)
      AND COALESCE(pa.status, 'pending') NOT IN ('cancelled', 'rescheduled', 'completed', 'missed')
      AND COALESCE(a.status::text, 'scheduled') NOT IN ('cancelled', 'rescheduled', 'completed', 'missed')
    ORDER BY
      pa.package_id,
      GREATEST(
        COALESCE(a.updated_at, a.created_at, 'epoch'::timestamptz),
        COALESCE(pa.updated_at, pa.created_at, 'epoch'::timestamptz)
      ) DESC,
      COALESCE(pa.sequence_order, pa.session_number) DESC,
      pa.id
  LOOP
    PERFORM public.recalculate_package_minimum_intervals(rec.id);
  END LOOP;

  PERFORM public.refresh_appointment_name_snapshots(NULL);
END $$;
