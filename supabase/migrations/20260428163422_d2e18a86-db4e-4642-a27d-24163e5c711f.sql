ALTER TABLE public.service_packages
ADD COLUMN IF NOT EXISTS package_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.package_appointments
ADD COLUMN IF NOT EXISTS service_id uuid,
ADD COLUMN IF NOT EXISTS interval_after_days integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS sequence_order integer;

UPDATE public.package_appointments
SET sequence_order = COALESCE(sequence_order, original_session_number, session_number)
WHERE sequence_order IS NULL;

UPDATE public.package_appointments pa
SET service_id = sp.service_id
FROM public.service_packages sp
WHERE pa.package_id = sp.id
  AND pa.service_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_package_appointments_package_sequence
ON public.package_appointments(package_id, sequence_order);

CREATE INDEX IF NOT EXISTS idx_package_appointments_service_id
ON public.package_appointments(service_id);

CREATE INDEX IF NOT EXISTS idx_service_packages_package_type
ON public.service_packages(package_type);