-- Restore secure visibility of in-use packages and their applications in the agenda.
-- This keeps strict isolation but lets professionals see packages tied to their clients or appointments.

DROP POLICY IF EXISTS "Users can view service packages based on role" ON public.service_packages;

CREATE POLICY "Users can view service packages based on role"
ON public.service_packages
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
  OR professional_id IS NULL
  OR professional_id = public.get_professional_id_for_user((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = service_packages.client_id
      AND c.assigned_professional_id = public.get_professional_id_for_user((SELECT auth.uid()))
  )
  OR EXISTS (
    SELECT 1
    FROM public.package_appointments pa
    JOIN public.appointments a ON a.id = pa.appointment_id
    WHERE pa.package_id = service_packages.id
      AND a.professional_id = public.get_professional_id_for_user((SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "Authenticated users can view package appointments" ON public.package_appointments;

CREATE POLICY "Users can view package applications based on package access"
ON public.package_appointments
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.service_packages sp
    WHERE sp.id = package_appointments.package_id
      AND (
        sp.professional_id IS NULL
        OR sp.professional_id = public.get_professional_id_for_user((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id = sp.client_id
            AND c.assigned_professional_id = public.get_professional_id_for_user((SELECT auth.uid()))
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = package_appointments.appointment_id
      AND a.professional_id = public.get_professional_id_for_user((SELECT auth.uid()))
  )
);