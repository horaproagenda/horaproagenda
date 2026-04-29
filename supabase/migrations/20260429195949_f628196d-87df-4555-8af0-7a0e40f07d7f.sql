-- Corrigir recursão nas políticas de pacotes e aplicações de pacotes
CREATE OR REPLACE FUNCTION public.can_access_service_package(_package_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.service_packages sp
      WHERE sp.id = _package_id
        AND (
          sp.professional_id IS NULL
          OR sp.professional_id = public.get_professional_id_for_user(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.clients c
            WHERE c.id = sp.client_id
              AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.package_appointments pa
            JOIN public.appointments a ON a.id = pa.appointment_id
            WHERE pa.package_id = sp.id
              AND a.professional_id = public.get_professional_id_for_user(auth.uid())
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_package_appointment(_package_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.package_appointments pa
    LEFT JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.id = _package_appointment_id
      AND (
        public.can_access_service_package(pa.package_id)
        OR a.professional_id = public.get_professional_id_for_user(auth.uid())
      )
  );
$$;

DROP POLICY IF EXISTS "Users can view service packages based on role" ON public.service_packages;
CREATE POLICY "Users can view service packages based on role"
ON public.service_packages
FOR SELECT
TO authenticated
USING (public.can_access_service_package(id));

DROP POLICY IF EXISTS "Users can view package applications based on package access" ON public.package_appointments;
CREATE POLICY "Users can view package applications based on package access"
ON public.package_appointments
FOR SELECT
TO authenticated
USING (public.can_access_service_package(package_id));