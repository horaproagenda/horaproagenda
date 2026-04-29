-- Restore packages that still have complete package/client/value information but were incorrectly hidden by is_active=false
UPDATE public.service_packages
SET is_active = true,
    updated_at = now()
WHERE id IN (
  '2c2f4ae1-846a-41c8-a78f-9f4254a06653'::uuid,
  '04264a67-047a-447e-8db7-c0b5d609cb47'::uuid
)
AND is_active = false;

-- Restore package applications that were cancelled without an appointment link, preserving package/session metadata
UPDATE public.package_appointments
SET status = 'pending',
    updated_at = now()
WHERE package_id IN (
  '2c2f4ae1-846a-41c8-a78f-9f4254a06653'::uuid,
  '04264a67-047a-447e-8db7-c0b5d609cb47'::uuid
)
AND appointment_id IS NULL
AND status = 'cancelled';

-- Recalculate scheduled/used counter from the actual application records to keep package totals consistent
UPDATE public.service_packages sp
SET sessions_scheduled = COALESCE(counts.used_or_scheduled, 0),
    updated_at = now()
FROM (
  SELECT
    package_id,
    COUNT(*) FILTER (WHERE status IN ('scheduled', 'completed', 'used'))::integer AS used_or_scheduled
  FROM public.package_appointments
  WHERE package_id IN (
    '2c2f4ae1-846a-41c8-a78f-9f4254a06653'::uuid,
    '04264a67-047a-447e-8db7-c0b5d609cb47'::uuid
  )
  GROUP BY package_id
) counts
WHERE sp.id = counts.package_id;