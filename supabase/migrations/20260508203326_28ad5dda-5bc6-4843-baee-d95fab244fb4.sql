DROP POLICY IF EXISTS "Authenticated users can view package appointment history" ON public.package_appointment_history;

CREATE POLICY "Users can view package history they can access"
ON public.package_appointment_history
FOR SELECT
TO authenticated
USING (public.can_access_service_package(package_id));