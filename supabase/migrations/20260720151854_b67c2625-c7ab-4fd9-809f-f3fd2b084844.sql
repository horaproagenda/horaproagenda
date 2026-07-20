
-- 1) Para pacotes sequenciais, o service_id do pacote não deve apontar para
-- um serviço específico (isso quebrava a resolução por etapa e fazia o
-- resolve_service_id_for_package retornar sempre o mesmo serviço).
UPDATE public.service_packages
SET service_id = NULL, updated_at = now()
WHERE package_type = 'sequential' AND service_id IS NOT NULL;

-- 2) Backfill do service_id de cada package_appointment usando o template step
-- correspondente ao sequence_order da sessão. Só corrige quando o pa.service_id
-- diverge do step do template (ou está nulo).
UPDATE public.package_appointments pa
SET service_id = pts.service_id, updated_at = now()
FROM public.service_packages sp
JOIN public.package_template_steps pts
  ON pts.template_id = sp.template_id
WHERE pa.package_id = sp.id
  AND sp.package_type = 'sequential'
  AND sp.template_id IS NOT NULL
  AND pts.sequence_order = COALESCE(pa.sequence_order, pa.session_number)
  AND pts.service_id IS NOT NULL
  AND (pa.service_id IS DISTINCT FROM pts.service_id);

-- 3) Sincroniza o appointment vinculado ao package_appointment com o service
-- correto da etapa, incluindo o snapshot do nome exibido no card.
UPDATE public.appointments a
SET service_id = pa.service_id,
    service_name_snapshot = s.name,
    updated_at = now()
FROM public.package_appointments pa
JOIN public.services s ON s.id = pa.service_id
JOIN public.service_packages sp ON sp.id = pa.package_id
WHERE a.id = pa.appointment_id
  AND sp.package_type = 'sequential'
  AND pa.service_id IS NOT NULL
  AND (a.service_id IS DISTINCT FROM pa.service_id
       OR a.service_name_snapshot IS DISTINCT FROM s.name);
