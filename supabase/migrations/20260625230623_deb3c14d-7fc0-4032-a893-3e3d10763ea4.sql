UPDATE public.whatsapp_send_queue
SET status='pending', attempts=0, next_attempt_at=now(), last_error=NULL, updated_at=now()
WHERE (status='failed' OR status='pending')
  AND (last_error ILIKE '%não conectado%' OR last_error ILIKE '%nao conectado%' OR last_error ILIKE '%estado: desconhecido%');