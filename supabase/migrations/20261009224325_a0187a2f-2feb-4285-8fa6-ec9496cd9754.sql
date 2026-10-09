-- Datas/horários gravados são definitivos: rotinas automáticas não podem mais empurrar sessões de pacote.
CREATE OR REPLACE FUNCTION public.recalculate_package_minimum_intervals(_package_appointment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Desativado: nunca recalcular datas/horários já gravados (regra "datas manuais definitivas").
  RETURN 0;
END; $$;

CREATE OR REPLACE FUNCTION public.cascade_package_intervals_after_anchor(_package_id uuid, _anchor_start timestamptz, _from_start timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Desativado: propagação só pelo fluxo explícito autorizado pelo profissional.
  RETURN 0;
END; $$;

-- Trilha: toda mudança de data/horário de sessão de pacote fica registrada com autor.
CREATE OR REPLACE FUNCTION public.log_package_session_time_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.package_appointment_id IS NOT NULL AND NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    INSERT INTO public.audit_logs(user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'update', 'appointments', NEW.id,
      jsonb_build_object('start_time', OLD.start_time, 'end_time', OLD.end_time, 'source', 'package_time_change'),
      jsonb_build_object('start_time', NEW.start_time, 'end_time', NEW.end_time, 'by_user', auth.uid() IS NOT NULL));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_log_package_session_time_change ON public.appointments;
CREATE TRIGGER trg_log_package_session_time_change AFTER UPDATE OF start_time ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.log_package_session_time_change();