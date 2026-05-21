
-- 1) boleto_audit_log: restrict INSERT to admin/receptionist
DROP POLICY IF EXISTS "Authenticated users can create boleto audit logs" ON public.boleto_audit_log;
CREATE POLICY "Admins and receptionists can create boleto audit logs"
ON public.boleto_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'receptionist'::app_role)
);

-- 2) twilio_message_events: block direct INSERT/UPDATE/DELETE from clients
CREATE POLICY "Block direct inserts to twilio message events"
ON public.twilio_message_events
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block direct updates to twilio message events"
ON public.twilio_message_events
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block direct deletes to twilio message events"
ON public.twilio_message_events
FOR DELETE
TO authenticated
USING (false);

-- 3) whatsapp_messages: admin visibility for NULL/system rows
CREATE POLICY "Admins can view all whatsapp messages"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete whatsapp messages"
ON public.whatsapp_messages
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
