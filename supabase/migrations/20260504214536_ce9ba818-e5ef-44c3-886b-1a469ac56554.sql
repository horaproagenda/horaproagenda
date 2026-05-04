
-- 1. Restrict business_settings SELECT to admin/receptionist (hides Twilio/CNPJ from professionals)
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.business_settings;
CREATE POLICY "Admins and receptionists can view settings"
  ON public.business_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'receptionist'::public.app_role));

-- 2. WhatsApp queue: enforce phone matches the assigned client's actual phone
DROP POLICY IF EXISTS whatsapp_queue_insert ON public.whatsapp_queue;
CREATE POLICY whatsapp_queue_insert
  ON public.whatsapp_queue FOR INSERT TO authenticated
  WITH CHECK (
    phone IS NOT NULL
    AND client_id IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR (
        public.has_role(auth.uid(), 'professional'::public.app_role)
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = whatsapp_queue.client_id
            AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
            AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') = regexp_replace(whatsapp_queue.phone, '\D', '', 'g')
            AND length(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')) > 0
        )
      )
    )
  );

-- 3. Service packages without an assigned professional should NOT be visible to all professionals
CREATE OR REPLACE FUNCTION public.can_access_service_package(_package_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.service_packages sp
      WHERE sp.id = _package_id
        AND (
          sp.professional_id = public.get_professional_id_for_user(auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = sp.client_id
              AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.package_appointments pa
            JOIN public.appointments a ON a.id = pa.appointment_id
            WHERE pa.package_id = sp.id
              AND a.professional_id = public.get_professional_id_for_user(auth.uid())
          )
        )
    );
$$;

-- 4. Package templates: scope visibility to admin/receptionist or assigned professional
DROP POLICY IF EXISTS "Authenticated users can view package templates" ON public.package_templates;
CREATE POLICY "Users can view package templates based on role"
  ON public.package_templates FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid()))
  );

-- 5. Defense-in-depth: remove duplicate professional INSERT policy and ensure only admins can insert
DROP POLICY IF EXISTS "Admins can insert professionals" ON public.professionals;
-- "Only admins can insert professionals" remains
