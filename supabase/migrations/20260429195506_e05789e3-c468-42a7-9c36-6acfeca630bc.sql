-- Restaurar pacotes em uso na agenda preservando dados existentes
WITH used_packages AS (
  SELECT DISTINCT sp.id
  FROM public.service_packages sp
  JOIN public.package_appointments pa ON pa.package_id = sp.id
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE a.status IN ('scheduled', 'confirmed', 'completed', 'missed')
), package_counts AS (
  SELECT
    pa.package_id,
    COUNT(*) FILTER (WHERE pa.appointment_id IS NOT NULL)::integer AS linked_sessions
  FROM public.package_appointments pa
  WHERE pa.package_id IN (SELECT id FROM used_packages)
  GROUP BY pa.package_id
)
UPDATE public.service_packages sp
SET
  is_active = true,
  sessions_scheduled = COALESCE(pc.linked_sessions, sp.sessions_scheduled, 0),
  updated_at = now()
FROM package_counts pc
WHERE sp.id = pc.package_id;

-- Garantir que a aplicação do pacote reflita o status real do agendamento vinculado
WITH used_packages AS (
  SELECT DISTINCT sp.id
  FROM public.service_packages sp
  JOIN public.package_appointments pa ON pa.package_id = sp.id
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE a.status IN ('scheduled', 'confirmed', 'completed', 'missed')
)
UPDATE public.package_appointments pa
SET
  status = CASE
    WHEN a.status = 'completed' THEN 'completed'
    WHEN a.status = 'missed' THEN 'missed'
    WHEN a.status IN ('scheduled', 'confirmed') THEN 'scheduled'
    ELSE pa.status
  END,
  scheduled_date = COALESCE(pa.scheduled_date, a.start_time),
  service_id = COALESCE(pa.service_id, a.service_id)
FROM public.appointments a
WHERE pa.appointment_id = a.id
  AND pa.package_id IN (SELECT id FROM used_packages)
  AND (
    pa.status IS DISTINCT FROM CASE
      WHEN a.status = 'completed' THEN 'completed'
      WHEN a.status = 'missed' THEN 'missed'
      WHEN a.status IN ('scheduled', 'confirmed') THEN 'scheduled'
      ELSE pa.status
    END
    OR pa.scheduled_date IS NULL
    OR (pa.service_id IS NULL AND a.service_id IS NOT NULL)
  );

-- Garantir vínculo reverso da agenda para a aplicação do pacote
WITH used_links AS (
  SELECT pa.id AS package_appointment_id, pa.appointment_id
  FROM public.package_appointments pa
  JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.appointment_id IS NOT NULL
)
UPDATE public.appointments a
SET
  package_appointment_id = ul.package_appointment_id,
  updated_at = now()
FROM used_links ul
WHERE a.id = ul.appointment_id
  AND a.package_appointment_id IS DISTINCT FROM ul.package_appointment_id;