ALTER TABLE public.package_appointments
  DROP CONSTRAINT IF EXISTS package_appointments_service_id_fkey;
ALTER TABLE public.package_appointments
  ADD CONSTRAINT package_appointments_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;