
CREATE OR REPLACE FUNCTION public.sync_appointment_payment_date_from_financial_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_date IS DISTINCT FROM OLD.paid_date
     AND NEW.paid_date IS NOT NULL THEN
    UPDATE public.appointments
       SET payment_date = NEW.paid_date::date
     WHERE id = NEW.appointment_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appt_payment_date ON public.financial_entries;
CREATE TRIGGER trg_sync_appt_payment_date
AFTER UPDATE OF paid_date ON public.financial_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_payment_date_from_financial_entry();
