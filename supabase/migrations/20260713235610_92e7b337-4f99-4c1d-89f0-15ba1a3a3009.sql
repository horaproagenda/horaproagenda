DO $$
DECLARE
  v_pkg RECORD;
BEGIN
  -- Evita disparar o trigger de histórico (que exige contexto auth.uid()).
  SET LOCAL session_replication_role = 'replica';

  FOR v_pkg IN
    SELECT sp.id AS package_id, sp.template_id
    FROM public.service_packages sp
    WHERE sp.package_type = 'sequential'
      AND sp.client_id IS NOT NULL
      AND sp.template_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.package_template_steps s WHERE s.template_id = sp.template_id)
  LOOP
    UPDATE public.package_appointments pa
    SET interval_after_days = s.interval_after_days,
        service_id = COALESCE(s.service_id, pa.service_id),
        sequence_order = s.sequence_order
    FROM public.package_template_steps s
    WHERE s.template_id = v_pkg.template_id
      AND pa.package_id = v_pkg.package_id
      AND pa.session_number = s.sequence_order
      AND pa.status = 'pending'
      AND pa.appointment_id IS NULL
      AND (
        pa.interval_after_days IS DISTINCT FROM s.interval_after_days
        OR pa.service_id IS DISTINCT FROM COALESCE(s.service_id, pa.service_id)
        OR pa.sequence_order IS DISTINCT FROM s.sequence_order
      );
  END LOOP;
END $$;