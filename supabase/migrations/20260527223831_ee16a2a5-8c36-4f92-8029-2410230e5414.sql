
-- 1) Reconciliar vínculo package_appointment_id em appointments
UPDATE public.appointments a
SET package_appointment_id = pa.id,
    updated_at = now()
FROM public.package_appointments pa
WHERE pa.appointment_id = a.id
  AND a.package_appointment_id IS DISTINCT FROM pa.id;

-- 2) Reconciliar appointment_id em package_appointments
UPDATE public.package_appointments pa
SET appointment_id = a.id,
    updated_at = now()
FROM public.appointments a
WHERE a.package_appointment_id = pa.id
  AND pa.appointment_id IS DISTINCT FROM a.id;

-- 3) Recalcular payment_status com base em amount_paid vs preço efetivo
WITH calc AS (
  SELECT a.id,
         COALESCE(a.amount_paid, 0) AS paid,
         GREATEST(
           COALESCE(s.price, 0) - COALESCE(a.discount_amount, 0),
           0
         ) AS expected
  FROM public.appointments a
  LEFT JOIN public.services s ON s.id = a.service_id
  WHERE a.status NOT IN ('cancelled')
)
UPDATE public.appointments a
SET payment_status = CASE
      WHEN c.expected <= 0 AND c.paid <= 0 THEN COALESCE(a.payment_status, 'pending')
      WHEN c.paid <= 0 THEN 'pending'
      WHEN c.paid + 0.01 < c.expected THEN 'partial'
      ELSE 'paid'
    END,
    updated_at = now()
FROM calc c
WHERE c.id = a.id
  AND a.payment_status IS DISTINCT FROM CASE
      WHEN c.expected <= 0 AND c.paid <= 0 THEN COALESCE(a.payment_status, 'pending')
      WHEN c.paid <= 0 THEN 'pending'
      WHEN c.paid + 0.01 < c.expected THEN 'partial'
      ELSE 'paid'
    END;

-- 4) Criar entradas financeiras faltantes para agendamentos pagos
INSERT INTO public.financial_entries (
  id, type, amount, original_amount, description,
  appointment_id, client_id, professional_id,
  due_date, paid_date, status, created_at, updated_at, created_by
)
SELECT
  gen_random_uuid(),
  'income',
  COALESCE(a.amount_paid, 0),
  COALESCE(a.amount_paid, 0),
  'Backfill: ' || COALESCE(s.name, 'Atendimento') ||
    CASE WHEN c.name IS NOT NULL THEN ' — ' || c.name ELSE '' END,
  a.id,
  a.client_id,
  a.professional_id,
  COALESCE(a.start_time::date, now()::date),
  COALESCE(a.start_time::date, now()::date),
  'paid',
  now(),
  now(),
  a.created_by
FROM public.appointments a
LEFT JOIN public.services s ON s.id = a.service_id
LEFT JOIN public.clients c ON c.id = a.client_id
WHERE a.payment_status = 'paid'
  AND COALESCE(a.amount_paid, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_entries fe
    WHERE fe.appointment_id = a.id
  );

-- 5) Sincronizar sessions_scheduled em service_packages
UPDATE public.service_packages sp
SET sessions_scheduled = sub.cnt,
    updated_at = now()
FROM (
  SELECT package_id, COUNT(*) FILTER (
    WHERE status NOT IN ('cancelled', 'rescheduled')
  ) AS cnt
  FROM public.package_appointments
  GROUP BY package_id
) sub
WHERE sp.id = sub.package_id
  AND COALESCE(sp.sessions_scheduled, -1) IS DISTINCT FROM sub.cnt;
