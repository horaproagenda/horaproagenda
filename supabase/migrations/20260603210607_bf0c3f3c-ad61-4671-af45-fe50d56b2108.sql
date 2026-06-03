
-- 1) Função: cancelar lembretes quando agendamento é EXCLUÍDO
CREATE OR REPLACE FUNCTION public.cleanup_reminders_on_appointment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_send_queue
   WHERE appointment_id = OLD.id
     AND status = 'pending';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_reminders_on_appointment_delete ON public.appointments;
CREATE TRIGGER trg_cleanup_reminders_on_appointment_delete
AFTER DELETE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_reminders_on_appointment_delete();

-- 2) Função: cancelar / reagendar lembretes quando o agendamento muda
CREATE OR REPLACE FUNCTION public.cleanup_reminders_on_appointment_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Status passou a "não-enviável" → cancela pendentes
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('cancelled', 'rescheduled', 'missed', 'completed') THEN
    UPDATE public.whatsapp_send_queue
       SET status = 'cancelled',
           reason = COALESCE(reason, '') || ' appointment_' || NEW.status,
           updated_at = now()
     WHERE appointment_id = NEW.id
       AND status = 'pending';
  END IF;

  -- Horário alterado → mensagem na fila está desatualizada.
  -- Remove pendentes e apaga log de envios desse agendamento
  -- para que o próximo ciclo do cron gere o lembrete com o NOVO horário.
  IF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    DELETE FROM public.whatsapp_send_queue
     WHERE appointment_id = NEW.id
       AND status = 'pending';
    DELETE FROM public.appointment_reminder_log
     WHERE appointment_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_reminders_on_appointment_update ON public.appointments;
CREATE TRIGGER trg_cleanup_reminders_on_appointment_update
AFTER UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_reminders_on_appointment_update();
