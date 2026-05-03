
-- 1. business_settings: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Authenticated users can view settings" ON public.business_settings;
CREATE POLICY "Authenticated users can view settings"
  ON public.business_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. boleto_installments: restrict to admin/receptionist
DROP POLICY IF EXISTS "Authenticated users can view boleto installments" ON public.boleto_installments;
DROP POLICY IF EXISTS "Authenticated users can create boleto installments" ON public.boleto_installments;
DROP POLICY IF EXISTS "Authenticated users can update boleto installments" ON public.boleto_installments;
DROP POLICY IF EXISTS "Authenticated users can delete boleto installments" ON public.boleto_installments;

CREATE POLICY "Staff can view boleto installments"
  ON public.boleto_installments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Staff can create boleto installments"
  ON public.boleto_installments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Staff can update boleto installments"
  ON public.boleto_installments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Staff can delete boleto installments"
  ON public.boleto_installments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

-- 3. package_appointments: restrict INSERT/UPDATE to staff
DROP POLICY IF EXISTS "Authenticated users can insert package appointments" ON public.package_appointments;
DROP POLICY IF EXISTS "Authenticated users can update package appointments" ON public.package_appointments;

CREATE POLICY "Staff can insert package appointments"
  ON public.package_appointments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Staff can update package appointments"
  ON public.package_appointments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

-- 4. package_template_products: restrict INSERT/UPDATE to staff
DROP POLICY IF EXISTS "Package template products can be created by authenticated users" ON public.package_template_products;
DROP POLICY IF EXISTS "Package template products can be updated by authenticated users" ON public.package_template_products;

CREATE POLICY "Staff can create package template products"
  ON public.package_template_products FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Staff can update package template products"
  ON public.package_template_products FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

-- 5. reminders: drop broad public-role policies (keep role-scoped)
DROP POLICY IF EXISTS "Auth users view reminders" ON public.reminders;
DROP POLICY IF EXISTS "Auth users insert reminders" ON public.reminders;
DROP POLICY IF EXISTS "Auth users update reminders" ON public.reminders;
DROP POLICY IF EXISTS "Auth users delete reminders" ON public.reminders;

-- 6. whatsapp_templates: drop broad public-role policies
DROP POLICY IF EXISTS "Auth users view whatsapp_templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Auth users insert whatsapp_templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Auth users update whatsapp_templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Auth users delete whatsapp_templates" ON public.whatsapp_templates;

-- 7. whatsapp_queue: rows with NULL client_id only accessible to staff
DROP POLICY IF EXISTS "whatsapp_queue_select" ON public.whatsapp_queue;
DROP POLICY IF EXISTS "whatsapp_queue_update" ON public.whatsapp_queue;
DROP POLICY IF EXISTS "whatsapp_queue_delete" ON public.whatsapp_queue;

CREATE POLICY "whatsapp_queue_select"
  ON public.whatsapp_queue FOR SELECT TO authenticated
  USING (
    (client_id IS NOT NULL AND client_id = auth.uid())
    OR (client_id IS NULL AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role)))
  );

CREATE POLICY "whatsapp_queue_update"
  ON public.whatsapp_queue FOR UPDATE TO authenticated
  USING (
    (client_id IS NOT NULL AND client_id = auth.uid())
    OR (client_id IS NULL AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role)))
  );

CREATE POLICY "whatsapp_queue_delete"
  ON public.whatsapp_queue FOR DELETE TO authenticated
  USING (
    (client_id IS NOT NULL AND client_id = auth.uid())
    OR (client_id IS NULL AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role)))
  );

-- 8. verification_codes: add attempts counter for brute-force protection
ALTER TABLE public.verification_codes
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
