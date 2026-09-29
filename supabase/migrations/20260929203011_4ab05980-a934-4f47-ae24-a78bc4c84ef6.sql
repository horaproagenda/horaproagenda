-- Kits (agendamentos compostos): nunca empurrar automaticamente as etapas
-- seguintes quando UMA etapa tem a data/horário alterados. O reencadeamento
-- passa a ser explícito (o app pede quando o profissional autoriza), evitando
-- que datas escolhidas manualmente sejam sobrescritas silenciosamente.
CREATE OR REPLACE FUNCTION public.cascade_composite_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  delta_ms bigint;
BEGIN
  IF NEW.composite_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só reencadeia quando explicitamente autorizado pela aplicação.
  IF COALESCE(current_setting('app.cascade_composite', true), '') <> 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.start_time IS DISTINCT FROM NEW.start_time
     AND NEW.status <> 'cancelled'
     AND COALESCE(current_setting('app.skip_composite_cascade', true), '') <> 'on'
  THEN
    delta_ms := EXTRACT(EPOCH FROM (NEW.start_time - OLD.start_time)) * 1000;

    PERFORM set_config('app.skip_composite_cascade', 'on', true);

    UPDATE public.appointments
       SET start_time = start_time + make_interval(secs => delta_ms / 1000.0),
           end_time   = end_time   + make_interval(secs => delta_ms / 1000.0),
           updated_at = now()
     WHERE composite_group_id = NEW.composite_group_id
       AND composite_sequence_order > NEW.composite_sequence_order
       AND status <> 'cancelled';

    PERFORM set_config('app.skip_composite_cascade', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;