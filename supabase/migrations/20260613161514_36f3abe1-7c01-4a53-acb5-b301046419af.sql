ALTER TABLE public.package_appointments DROP CONSTRAINT IF EXISTS package_appointments_status_check;
ALTER TABLE public.package_appointments ADD CONSTRAINT package_appointments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'completed'::text, 'cancelled'::text, 'missed'::text, 'rescheduled'::text, 'confirmed'::text]));