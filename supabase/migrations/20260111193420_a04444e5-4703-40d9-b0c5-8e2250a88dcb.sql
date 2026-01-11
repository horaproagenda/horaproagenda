-- Fix whatsapp_templates SELECT policy to require authentication
DROP POLICY IF EXISTS "Authenticated users can view whatsapp_templates" ON public.whatsapp_templates;

CREATE POLICY "Authenticated users can view whatsapp_templates" 
ON public.whatsapp_templates 
FOR SELECT TO authenticated
USING (true);