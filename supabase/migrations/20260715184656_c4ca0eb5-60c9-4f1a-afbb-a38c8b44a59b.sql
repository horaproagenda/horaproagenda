
-- 1) Reparo pontual: desabilita triggers de histórico só para esta transação
SET session_replication_role = replica;

WITH bad AS (
  SELECT pa.id, pa.package_id
  FROM package_appointments pa
  LEFT JOIN appointments a ON a.id = pa.appointment_id
  WHERE pa.status IN ('completed','scheduled','missed')
    AND (pa.appointment_id IS NULL OR a.id IS NULL)
)
UPDATE package_appointments pa
   SET status = 'pending',
       appointment_id = NULL,
       scheduled_date = NULL
  FROM bad
 WHERE pa.id = bad.id;

UPDATE service_packages sp
   SET sessions_scheduled = COALESCE((
     SELECT count(*) FROM package_appointments pa
     WHERE pa.package_id = sp.id AND pa.appointment_id IS NOT NULL
   ), 0);

SET session_replication_role = DEFAULT;

-- 2) Função permanente para reparo sob demanda (SECURITY DEFINER e sem log)
CREATE OR REPLACE FUNCTION public.heal_phantom_package_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);

  WITH bad AS (
    SELECT pa.id
    FROM package_appointments pa
    LEFT JOIN appointments a ON a.id = pa.appointment_id
    WHERE pa.status IN ('completed','scheduled','missed')
      AND (pa.appointment_id IS NULL OR a.id IS NULL)
  ), upd AS (
    UPDATE package_appointments pa
       SET status = 'pending',
           appointment_id = NULL,
           scheduled_date = NULL
      FROM bad
     WHERE pa.id = bad.id
    RETURNING pa.id
  )
  SELECT count(*) INTO affected FROM upd;

  UPDATE service_packages sp
     SET sessions_scheduled = COALESCE((
       SELECT count(*) FROM package_appointments pa
       WHERE pa.package_id = sp.id AND pa.appointment_id IS NOT NULL
     ), 0);

  PERFORM set_config('session_replication_role', 'origin', true);
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.heal_phantom_package_sessions() TO authenticated, service_role;

-- 3) Trigger que impede persistir "consumido" sem appointment vinculado
CREATE OR REPLACE FUNCTION public.enforce_package_session_has_appointment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('completed','scheduled','missed') AND NEW.appointment_id IS NULL THEN
    NEW.status := 'pending';
    NEW.scheduled_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_package_session_has_appointment ON public.package_appointments;
CREATE TRIGGER trg_enforce_package_session_has_appointment
BEFORE INSERT OR UPDATE OF status, appointment_id ON public.package_appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_package_session_has_appointment();
