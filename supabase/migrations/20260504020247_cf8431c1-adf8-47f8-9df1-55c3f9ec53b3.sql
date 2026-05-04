
-- 1. appointment_product_consumption: drop permissive policies, fix professional check
DROP POLICY IF EXISTS "Consumption records can be created by authenticated users" ON public.appointment_product_consumption;
DROP POLICY IF EXISTS "Consumption records are viewable by authenticated users" ON public.appointment_product_consumption;
DROP POLICY IF EXISTS "Staff or assigned professional can record consumption" ON public.appointment_product_consumption;

CREATE POLICY "Staff or assigned professional can view consumption"
  ON public.appointment_product_consumption FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_product_consumption.appointment_id
        AND a.professional_id = get_professional_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Staff or assigned professional can record consumption"
  ON public.appointment_product_consumption FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_product_consumption.appointment_id
        AND a.professional_id = get_professional_id_for_user(auth.uid())
    )
  );

-- 2. client_services: remove unassigned-clients exposure
DROP POLICY IF EXISTS "Authenticated users can view client_services" ON public.client_services;
CREATE POLICY "Authenticated users can view client_services"
  ON public.client_services FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR (
      has_role(auth.uid(), 'professional'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_services.client_id
          AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
      )
    )
  );

-- 3. whatsapp_logs: remove permissive select
DROP POLICY IF EXISTS "whatsapp_logs_select" ON public.whatsapp_logs;

-- 4. professional_service_commissions: restrict select
DROP POLICY IF EXISTS "Authenticated users can view service commissions" ON public.professional_service_commissions;
CREATE POLICY "Staff and own professional can view service commissions"
  ON public.professional_service_commissions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR professional_id = get_professional_id_for_user(auth.uid())
  );

-- 5. whatsapp_queue: restrict professional inserts to their own clients
DROP POLICY IF EXISTS "whatsapp_queue_insert" ON public.whatsapp_queue;
CREATE POLICY "whatsapp_queue_insert"
  ON public.whatsapp_queue FOR INSERT TO authenticated
  WITH CHECK (
    phone IS NOT NULL
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'receptionist'::app_role)
      OR (
        has_role(auth.uid(), 'professional'::app_role)
        AND client_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = whatsapp_queue.client_id
            AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
        )
      )
    )
  );

-- 6. quotes: remove permissive insert + remove unassigned-clients exposure
DROP POLICY IF EXISTS "Authenticated users can insert quotes" ON public.quotes;

DROP POLICY IF EXISTS "Users can view quotes based on role" ON public.quotes;
CREATE POLICY "Users can view quotes based on role"
  ON public.quotes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = quotes.client_id
        AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update quotes based on role" ON public.quotes;
CREATE POLICY "Users can update quotes based on role"
  ON public.quotes FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = quotes.client_id
        AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff or assigned professional can create quotes" ON public.quotes;
CREATE POLICY "Staff or assigned professional can create quotes"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = quotes.client_id
        AND c.assigned_professional_id = get_professional_id_for_user(auth.uid())
    )
  );
