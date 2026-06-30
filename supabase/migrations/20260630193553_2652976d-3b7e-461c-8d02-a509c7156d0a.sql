
-- 1) Guard trigger: bloqueia INSERT de package_appointments além do total contratado
CREATE OR REPLACE FUNCTION public.tg_block_excess_package_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer;
  v_existing integer;
BEGIN
  -- Permite reconstruções internas (rebuild_package_appointments)
  IF current_setting('app.skip_rebuild_pa', true) = '1' THEN
    RETURN NEW;
  END IF;

  SELECT total_sessions INTO v_total
  FROM public.service_packages
  WHERE id = NEW.package_id;

  IF v_total IS NULL OR v_total <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.package_appointments
  WHERE package_id = NEW.package_id;

  IF v_existing >= v_total THEN
    RAISE EXCEPTION 'Pacote % já possui % sessões (limite contratado). Não é permitido criar nova sessão; reagende uma existente.', NEW.package_id, v_total
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_excess_package_sessions ON public.package_appointments;
CREATE TRIGGER trg_block_excess_package_sessions
BEFORE INSERT ON public.package_appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_block_excess_package_sessions();

-- 2) Função de auditoria para detectar inconsistências em pacotes
CREATE OR REPLACE FUNCTION public.audit_package_session_integrity()
RETURNS TABLE (
  package_id uuid,
  package_name text,
  client_id uuid,
  total_sessions integer,
  existing_sessions integer,
  duplicate_sequences integer,
  issue text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH counts AS (
    SELECT
      sp.id AS package_id,
      sp.name AS package_name,
      sp.client_id,
      sp.total_sessions,
      (SELECT count(*)::int FROM public.package_appointments pa WHERE pa.package_id = sp.id) AS existing_sessions,
      (
        SELECT count(*)::int FROM (
          SELECT sequence_order
          FROM public.package_appointments pa
          WHERE pa.package_id = sp.id
          GROUP BY sequence_order
          HAVING count(*) > 1
        ) d
      ) AS duplicate_sequences
    FROM public.service_packages sp
    WHERE sp.is_active = true
  )
  SELECT
    package_id, package_name, client_id, total_sessions, existing_sessions, duplicate_sequences,
    CASE
      WHEN existing_sessions > total_sessions THEN 'excess_sessions'
      WHEN duplicate_sequences > 0 THEN 'duplicate_sequence_order'
      WHEN existing_sessions < total_sessions THEN 'missing_sessions'
      ELSE 'ok'
    END AS issue
  FROM counts
  WHERE existing_sessions <> total_sessions OR duplicate_sequences > 0;
$$;

GRANT EXECUTE ON FUNCTION public.audit_package_session_integrity() TO authenticated, service_role;

-- 3) Corrige o pacote da Flávia: remove a 11ª sessão criada por engano e reconstrói
DO $$
DECLARE
  v_pkg_id uuid;
  v_total integer;
  v_excess integer;
  v_ids uuid[];
BEGIN
  FOR v_pkg_id, v_total IN
    SELECT sp.id, sp.total_sessions
    FROM public.service_packages sp
    WHERE sp.is_active = true
  LOOP
    SELECT count(*)::int INTO v_excess
    FROM public.package_appointments pa
    WHERE pa.package_id = v_pkg_id;

    IF v_excess > v_total THEN
      -- Apaga as sessões mais recentes que NÃO têm appointment vinculado
      DELETE FROM public.package_appointments pa
      WHERE pa.id IN (
        SELECT id FROM public.package_appointments
        WHERE package_id = v_pkg_id
          AND appointment_id IS NULL
        ORDER BY created_at DESC
        LIMIT (v_excess - v_total)
      );
      -- Reconstrói para normalizar sequence_order/session_number
      PERFORM public.rebuild_package_appointments(v_pkg_id);
    END IF;
  END LOOP;
END $$;
