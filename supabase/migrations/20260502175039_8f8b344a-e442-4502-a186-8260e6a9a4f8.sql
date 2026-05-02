DROP POLICY IF EXISTS whatsapp_queue_insert ON public.whatsapp_queue;

CREATE POLICY whatsapp_queue_insert ON public.whatsapp_queue
FOR INSERT TO authenticated
WITH CHECK (
  phone IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);