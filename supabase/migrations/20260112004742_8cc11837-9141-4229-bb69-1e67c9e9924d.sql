-- Fix remaining policies - drop first then create

-- Fix reminders table
DROP POLICY IF EXISTS "Authenticated users can view reminders" ON public.reminders;
DROP POLICY IF EXISTS "Authenticated users can insert reminders" ON public.reminders;
DROP POLICY IF EXISTS "Authenticated users can update reminders" ON public.reminders;
DROP POLICY IF EXISTS "Authenticated users can delete reminders" ON public.reminders;

CREATE POLICY "Auth users view reminders" ON public.reminders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users insert reminders" ON public.reminders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth users update reminders" ON public.reminders
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users delete reminders" ON public.reminders
  FOR DELETE USING (auth.role() = 'authenticated');

-- Fix whatsapp_templates
DROP POLICY IF EXISTS "Authenticated users can view whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can insert whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can update whatsapp templates" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "Authenticated users can delete whatsapp templates" ON public.whatsapp_templates;

CREATE POLICY "Auth users view whatsapp templates" ON public.whatsapp_templates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users insert whatsapp templates" ON public.whatsapp_templates
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth users update whatsapp templates" ON public.whatsapp_templates
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth users delete whatsapp templates" ON public.whatsapp_templates
  FOR DELETE USING (auth.role() = 'authenticated');