-- Corrige definitivamente o reagendamento de pacotes:
-- 1) reagendar não pode soltar o vínculo package_appointment_id;
-- 2) a sessão reagendada deve continuar visível na agenda;
-- 3) a próxima aplicação deve ser recalculada exatamente a partir da nova data
--    respeitando o intervalo mínimo de 21 dias.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_name_snapshot text,
  ADD COLUMN IF NOT EXISTS package_name_snapshot text;

CREATE OR REPLACE FUNCTION public.release_package_session_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_id uuid;
  v_old_pa record;
  v_replacement_id uuid;
  v_mode text;
BEGIN
  v_mode := NULLIF(current_setting('app.package_outcome_mode', true), '');

  IF TG_OP = 'UPDATE'
     AND OLD.package_appointment_id IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    -- Reagendamento comum NUNCA libera/desvincula a sessão do pacote.
    -- A liberação só acontece quando o usuário escolhe explicitamente
    -- "liberar a sessão" no fluxo de cancelamento/falta.
    IF v_mode = 'consume' THEN
      RETURN NEW;
    END IF;

    IF v_mode = 'release' THEN
      SELECT pa.*, sp.account_owner_id
      INTO v_old_pa
      FROM public.package_appointments pa
      JOIN public.service_packages sp ON sp.id = pa.package_id
      WHERE pa.id = OLD.package_appointment_id
      FOR UPDATE;

      IF FOUND THEN
        v_package_id := v_old_pa.package_id;

        UPDATE public.package_appointments pa
        SET appointment_id = NULL,
            scheduled_date = NULL,
            status = 'pending',
            updated_at = now()
        WHERE pa.id = OLD.package_appointment_id;

        -- Mantém um registro histórico vinculado ao atendimento cancelado/faltou,
        -- sem ocupar a sessão ativa liberada acima.
        INSERT INTO public.package_appointments (
          package_id,
          appointment_id,
          session_number,
          original_session_number,
          sequence_order,
          interval_after_days,
          scheduled_date,
          status,
          service_id,
          notes,
          account_owner_id
        ) VALUES (
          v_old_pa.package_id,
          NEW.id,
          v_old_pa.session_number,
          COALESCE(v_old_pa.original_session_number, v_old_pa.session_number),
          v_old_pa.sequence_order,
          v_old_pa.interval_after_days,
          NEW.start_time,
          COALESCE(NEW.status::text, 'cancelled'),
          v_old_pa.service_id,
          NULLIF(NEW.notes, ''),
          v_old_pa.account_owner_id
        )
        RETURNING id INTO v_replacement_id;

        NEW.package_appointment_id := v_replacement_id;
        PERFORM public.recount_service_package_sessions(v_package_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_release_package_session_on_cancel ON public.appointments;
CREATE TRIGGER trg_release_package_session_on_cancel
BEFORE UPDATE OF status ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.release_package_session_on_cancel();

CREATE OR REPLACE FUNCTION public.sync_package_appointment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_mode = 'consume' THEN
    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'missed'
      WHEN 'rescheduled' THEN 'missed'
      ELSE 'scheduled'
    END;
  ELSE
    -- Fluxo padrão: preservar o vínculo e espelhar o status.
    -- Isso impede que uma aplicação reagendada suma da agenda por perder
    -- package_appointment_id.
    v_new_status := CASE NEW.status::text
      WHEN 'completed' THEN 'completed'
      WHEN 'missed' THEN 'missed'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'rescheduled' THEN 'rescheduled'
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
$function$;

DROP TRIGGER IF EXISTS trg_sync_package_appointment_status ON public.appointments;
CREATE TRIGGER trg_sync_package_appointment_status
AFTER INSERT OR UPDATE OF status, package_appointment_id, start_time ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_package_appointment_status();

CREATE OR REPLACE FUNCTION public.recalculate_package_minimum_intervals(_package_appointment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_is_anchor boolean;
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
    v_is_anchor := rec.id = _package_appointment_id;

    -- Histórico cancelado/reagendado não empurra a cadeia, exceto quando é
    -- exatamente a sessão que acabou de ser movida e foi usada como âncora.
    v_is_inactive_history := NOT v_is_anchor AND (
      COALESCE(rec.package_status, 'pending') IN ('cancelled', 'rescheduled')
      OR COALESCE(rec.appointment_status, 'scheduled') IN ('cancelled', 'rescheduled')
    );

    v_is_mutable := NOT v_is_inactive_history
      AND NOT v_is_anchor
      AND COALESCE(rec.package_status, 'scheduled') NOT IN ('completed', 'missed')
      AND COALESCE(rec.appointment_status, 'scheduled') NOT IN ('completed', 'missed');

    IF v_is_anchor THEN
      v_started := true;
    END IF;

    IF v_started AND NOT v_is_anchor AND v_previous_start IS NOT NULL THEN
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

    IF (NOT v_is_inactive_history OR v_is_anchor) AND v_effective_start IS NOT NULL THEN
      v_previous_start := v_effective_start;
      v_previous_interval := rec.interval_after_days;
    END IF;
  END LOOP;

  PERFORM set_config('app.skip_package_interval_cascade', 'off', true);
  PERFORM set_config('app.skip_rebuild_pa', '0', true);

  RETURN v_updates;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalculate_package_minimum_intervals(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_client_package_schedule_and_history(_client_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  rec record;
  v_relinked integer := 0;
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

  -- Religa aplicações de pacote que ficaram órfãs pelo antigo trigger de
  -- reagendamento e, se a aplicação já tem nova data futura, volta o status
  -- para scheduled para aparecer na agenda.
  FOR rec IN
    SELECT DISTINCT ON (a.id)
      a.id AS appointment_id,
      sp.id AS package_id,
      pa.id AS package_appointment_id
    FROM public.appointments a
    JOIN public.service_packages sp
      ON sp.client_id = a.client_id
     AND sp.is_active = true
    JOIN public.package_appointments pa
      ON pa.package_id = sp.id
     AND pa.appointment_id IS NULL
     AND COALESCE(pa.status, 'pending') IN ('pending', 'scheduled', 'rescheduled')
    WHERE (_client_id IS NULL OR a.client_id = _client_id)
      AND a.package_appointment_id IS NULL
      AND a.status::text IN ('scheduled', 'confirmed', 'rescheduled')
      AND a.notes IS NOT NULL
      AND lower(a.notes) LIKE '%' || lower(sp.name) || '%'
    ORDER BY
      a.id,
      CASE WHEN pa.scheduled_date IS NULL THEN 1 ELSE 0 END,
      abs(extract(epoch from (COALESCE(pa.scheduled_date, a.start_time) - a.start_time))),
      COALESCE(pa.sequence_order, pa.session_number),
      pa.created_at
  LOOP
    BEGIN
      UPDATE public.package_appointments
      SET status = 'pending',
          updated_at = now()
      WHERE id = rec.package_appointment_id
        AND appointment_id IS NULL
        AND status = 'rescheduled';

      UPDATE public.appointments
      SET status = 'scheduled'::public.appointment_status,
          updated_at = now()
      WHERE id = rec.appointment_id
        AND status = 'rescheduled'
        AND start_time >= now() - interval '1 day';

      PERFORM public.link_package_session_to_appointment(rec.package_id, rec.appointment_id);
      v_relinked := v_relinked + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

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

  -- Primeiro usa como âncora a sessão ativa modificada/agendada mais recentemente.
  FOR rec IN
    SELECT DISTINCT ON (pa.package_id) pa.id
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE sp.is_active = true
      AND (_client_id IS NULL OR sp.client_id = _client_id)
      AND (pa.appointment_id IS NOT NULL OR pa.scheduled_date IS NOT NULL)
      AND COALESCE(pa.status, 'pending') NOT IN ('cancelled', 'completed', 'missed')
      AND COALESCE(a.status::text, 'scheduled') NOT IN ('cancelled', 'completed', 'missed')
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

  -- Depois corrige qualquer lacuna restante diferente do intervalo mínimo.
  FOR rec IN
    WITH ordered AS (
      SELECT
        pa.id,
        pa.package_id,
        COALESCE(a.start_time, pa.scheduled_date) AS effective_start,
        GREATEST(21, COALESCE(NULLIF(pa.interval_after_days, 0), NULLIF(sp.interval_days, 0), 21)) AS expected_days,
        LEAD(COALESCE(a.start_time, pa.scheduled_date)) OVER (
          PARTITION BY pa.package_id
          ORDER BY COALESCE(pa.sequence_order, pa.session_number), COALESCE(a.start_time, pa.scheduled_date), pa.created_at, pa.id
        ) AS next_start
      FROM public.package_appointments pa
      JOIN public.service_packages sp ON sp.id = pa.package_id
      LEFT JOIN public.appointments a ON a.id = pa.appointment_id
      WHERE sp.is_active = true
        AND (_client_id IS NULL OR sp.client_id = _client_id)
        AND COALESCE(pa.status, 'pending') NOT IN ('cancelled', 'completed', 'missed')
        AND COALESCE(a.status::text, 'scheduled') NOT IN ('cancelled', 'completed', 'missed')
        AND COALESCE(a.start_time, pa.scheduled_date) IS NOT NULL
    )
    SELECT id
    FROM ordered
    WHERE next_start IS NOT NULL
      AND next_start IS DISTINCT FROM (
        (((effective_start AT TIME ZONE 'America/Sao_Paulo')::date + expected_days)::timestamp
          + (effective_start AT TIME ZONE 'America/Sao_Paulo')::time
        ) AT TIME ZONE 'America/Sao_Paulo'
      )
    ORDER BY package_id, effective_start
  LOOP
    v_updates := public.recalculate_package_minimum_intervals(rec.id);
    v_recalculated := v_recalculated + COALESCE(v_updates, 0);
  END LOOP;

  SELECT public.refresh_appointment_name_snapshots(_client_id) INTO v_snapshots;

  RETURN jsonb_build_object(
    'relinkedAppointments', v_relinked,
    'rebuiltPackages', v_rebuilt,
    'rescheduledSessions', v_recalculated,
    'cancelledHistory', v_cancelled,
    'snapshots', v_snapshots
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.repair_client_package_schedule_and_history(uuid) TO authenticated, service_role;

-- Backfill imediato para corrigir pacotes já afetados pelo bug.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT client_id
    FROM public.service_packages
    WHERE is_active = true AND client_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.repair_client_package_schedule_and_history(rec.client_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
