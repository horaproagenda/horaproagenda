
-- 1. reminders: restore SELECT policy (was dropped along with the broad public-role policies)
DROP POLICY IF EXISTS "Staff can view reminders" ON public.reminders;
CREATE POLICY "Staff can view reminders"
  ON public.reminders FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

-- 2. quotes: restrict INSERT to staff or the assigned professional
DROP POLICY IF EXISTS "Authenticated users can create quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can create quotes" ON public.quotes;
DROP POLICY IF EXISTS "Staff or assigned professional can create quotes" ON public.quotes;
CREATE POLICY "Staff or assigned professional can create quotes"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.client_id = quotes.client_id
        AND a.professional_id = auth.uid()
    )
  );

-- 3. whatsapp_logs: restrict SELECT to admin/receptionist
DROP POLICY IF EXISTS "Authenticated users can view whatsapp logs" ON public.whatsapp_logs;
DROP POLICY IF EXISTS "Anyone can view whatsapp logs" ON public.whatsapp_logs;
DROP POLICY IF EXISTS "Staff can view whatsapp logs" ON public.whatsapp_logs;
CREATE POLICY "Staff can view whatsapp logs"
  ON public.whatsapp_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

-- 4. appointment_product_consumption: restrict INSERT to staff or the assigned professional
DROP POLICY IF EXISTS "Authenticated users can insert consumption" ON public.appointment_product_consumption;
DROP POLICY IF EXISTS "Users can insert appointment_product_consumption" ON public.appointment_product_consumption;
DROP POLICY IF EXISTS "Staff or assigned professional can record consumption" ON public.appointment_product_consumption;
CREATE POLICY "Staff or assigned professional can record consumption"
  ON public.appointment_product_consumption FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_product_consumption.appointment_id
        AND a.professional_id = auth.uid()
    )
  );
