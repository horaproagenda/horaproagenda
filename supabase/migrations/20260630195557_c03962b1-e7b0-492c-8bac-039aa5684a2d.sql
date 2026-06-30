
-- 1) Prevent two package_appointment rows from pointing to the same appointment
CREATE UNIQUE INDEX IF NOT EXISTS ux_package_appointments_appointment_id
  ON public.package_appointments(appointment_id)
  WHERE appointment_id IS NOT NULL;

-- 2) Strengthen the excess-block trigger to also catch cross-package linkage drift
CREATE OR REPLACE FUNCTION public.tg_block_excess_package_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_existing integer;
  v_appt_client uuid;
  v_pkg_client uuid;
BEGIN
  -- Allow internal rebuilds to bypass excess check
  IF current_setting('app.skip_rebuild_pa', true) = '1' THEN
    -- still enforce client coherence below
    NULL;
  ELSE
    IF TG_OP = 'INSERT' THEN
      SELECT total_sessions INTO v_total
        FROM public.service_packages
       WHERE id = NEW.package_id;

      IF v_total IS NOT NULL AND v_total > 0 THEN
        SELECT count(*) INTO v_existing
          FROM public.package_appointments
         WHERE package_id = NEW.package_id;

        IF v_existing >= v_total THEN
          RAISE EXCEPTION
            'Pacote % já possui % sessões (limite contratado). Reagende uma existente em vez de criar nova.',
            NEW.package_id, v_total
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Coherence: appointment_id must belong to the same client as the package
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT a.client_id INTO v_appt_client
      FROM public.appointments a
     WHERE a.id = NEW.appointment_id;

    SELECT sp.client_id INTO v_pkg_client
      FROM public.service_packages sp
     WHERE sp.id = NEW.package_id;

    IF v_appt_client IS NOT NULL
       AND v_pkg_client IS NOT NULL
       AND v_appt_client <> v_pkg_client THEN
      RAISE EXCEPTION
        'Divergência de pacote: agendamento % pertence ao cliente %, pacote pertence ao cliente %.',
        NEW.appointment_id, v_appt_client, v_pkg_client
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_excess_package_sessions ON public.package_appointments;
CREATE TRIGGER trg_block_excess_package_sessions
BEFORE INSERT OR UPDATE ON public.package_appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_block_excess_package_sessions();

-- 3) Pre-flight audit consumed by the UI before confirming a package reschedule
CREATE OR REPLACE FUNCTION public.audit_package_reschedule(
  p_appointment_id uuid,
  p_new_start timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appt public.appointments;
  v_pa public.package_appointments;
  v_pkg public.service_packages;
  v_total integer;
  v_existing integer;
  v_completed integer;
  v_warnings text[] := ARRAY[]::text[];
  v_blocking boolean := false;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'blocking', true,
      'warnings', jsonb_build_array('Agendamento não encontrado.'));
  END IF;

  IF v_appt.package_appointment_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'blocking', false,
      'warnings', '[]'::jsonb);
  END IF;

  SELECT * INTO v_pa FROM public.package_appointments WHERE id = v_appt.package_appointment_id;
  IF NOT FOUND THEN
    v_warnings := v_warnings || 'Vínculo de sessão do pacote ausente — revise o pacote antes de reagendar.';
    v_blocking := true;
  ELSE
    SELECT * INTO v_pkg FROM public.service_packages WHERE id = v_pa.package_id;

    IF v_pkg.client_id IS DISTINCT FROM v_appt.client_id THEN
      v_warnings := v_warnings ||
        'Cliente do agendamento difere do cliente do pacote. Reagendar pode quebrar a contagem.';
      v_blocking := true;
    END IF;

    IF v_appt.status IN ('completed','missed') THEN
      v_warnings := v_warnings ||
        'Esta aplicação já foi marcada como concluída/faltou. Reagendar pode alterar a contagem de aplicações realizadas.';
    END IF;

    v_total := COALESCE(v_pkg.total_sessions, 0);
    SELECT count(*), count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = pa.appointment_id
          AND a.status IN ('completed','missed')
      )
    )
      INTO v_existing, v_completed
      FROM public.package_appointments pa
     WHERE pa.package_id = v_pa.package_id;

    IF v_existing > v_total THEN
      v_warnings := v_warnings || format(
        'Pacote com %s sessões cadastradas mas total contratado é %s. Corrija antes de reagendar.',
        v_existing, v_total);
      v_blocking := true;
    END IF;

    IF p_new_start IS NOT NULL THEN
      -- Detect existing distinct session at the same slot for the package
      IF EXISTS (
        SELECT 1 FROM public.appointments a2
        JOIN public.package_appointments pa2 ON pa2.id = a2.package_appointment_id
        WHERE pa2.package_id = v_pa.package_id
          AND a2.id <> p_appointment_id
          AND a2.status NOT IN ('cancelled','missed','rescheduled')
          AND a2.start_time = p_new_start
      ) THEN
        v_warnings := v_warnings ||
          'Já existe outra aplicação do mesmo pacote neste horário. Escolha outra data para evitar duplicidade.';
        v_blocking := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', NOT v_blocking,
    'blocking', v_blocking,
    'warnings', to_jsonb(v_warnings),
    'total_sessions', COALESCE(v_pkg.total_sessions, 0),
    'existing_sessions', COALESCE(v_existing, 0),
    'realized_sessions', COALESCE(v_completed, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_package_reschedule(uuid, timestamptz) TO authenticated, service_role;
