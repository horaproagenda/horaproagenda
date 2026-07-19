
-- 1) Backfill pa.service_id: quando aponta para um serviço-kit (service_components não vazio),
-- troca pelo service_id do componente na posição correspondente ao sequence_order.
WITH targets AS (
  SELECT
    pa.id AS pa_id,
    pa.appointment_id,
    pa.sequence_order,
    s.service_components,
    jsonb_array_length(s.service_components) AS comp_len
  FROM public.package_appointments pa
  JOIN public.services s ON s.id = pa.service_id
  WHERE s.service_components IS NOT NULL
    AND jsonb_typeof(s.service_components) = 'array'
    AND jsonb_array_length(s.service_components) > 0
),
mapped AS (
  SELECT
    t.pa_id,
    t.appointment_id,
    NULLIF(
      t.service_components -> (((COALESCE(t.sequence_order, 1) - 1) % t.comp_len))
        ->> 'service_id',
      ''
    )::uuid AS new_service_id
  FROM targets t
)
UPDATE public.package_appointments pa
SET service_id = m.new_service_id,
    updated_at = now()
FROM mapped m
WHERE pa.id = m.pa_id
  AND m.new_service_id IS NOT NULL
  AND pa.service_id IS DISTINCT FROM m.new_service_id;

-- 2) Sincroniza os agendamentos vinculados: service_id + service_name_snapshot
UPDATE public.appointments a
SET service_id = pa.service_id,
    service_name_snapshot = s.name,
    updated_at = now()
FROM public.package_appointments pa
JOIN public.services s ON s.id = pa.service_id
WHERE a.package_appointment_id = pa.id
  AND pa.service_id IS NOT NULL
  AND (a.service_id IS DISTINCT FROM pa.service_id
       OR a.service_name_snapshot IS DISTINCT FROM s.name);

-- 3) Corrige end_time absurdo (duração > 4h) em qualquer agendamento cujo serviço
-- tenha duração real razoável (<= 8h). Usa a duração do serviço final vinculado.
UPDATE public.appointments a
SET end_time = a.start_time + make_interval(mins => s.duration),
    updated_at = now()
FROM public.services s
WHERE a.service_id = s.id
  AND s.duration IS NOT NULL
  AND s.duration BETWEEN 5 AND 480
  AND EXTRACT(EPOCH FROM (a.end_time - a.start_time))/60 > 240
  AND EXTRACT(EPOCH FROM (a.end_time - a.start_time))/60 <> s.duration;
