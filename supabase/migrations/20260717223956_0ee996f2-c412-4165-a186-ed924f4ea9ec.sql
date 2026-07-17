
CREATE INDEX IF NOT EXISTS idx_appointments_owner_start_time
  ON public.appointments (account_owner_id, start_time);

CREATE INDEX IF NOT EXISTS idx_service_packages_owner_created_at
  ON public.service_packages (account_owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_packages_owner_active
  ON public.service_packages (account_owner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_clients_owner_name
  ON public.clients (account_owner_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_professional_absences_owner_start_time
  ON public.professional_absences (account_owner_id, start_time);

ANALYZE public.appointments;
ANALYZE public.service_packages;
ANALYZE public.clients;
ANALYZE public.professional_absences;
