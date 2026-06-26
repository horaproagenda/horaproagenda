
-- Add payment_date to appointments for accurate, immutable payment date tracking.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS payment_date DATE;

-- Backfill: prefer financial_entries.paid_date for this appointment, else single_sales.paid_at,
-- else the appointment start date.
UPDATE public.appointments a
SET payment_date = COALESCE(
  (SELECT (fe.paid_date)::date
     FROM public.financial_entries fe
    WHERE fe.appointment_id = a.id
      AND fe.paid_date IS NOT NULL
    ORDER BY fe.paid_date ASC
    LIMIT 1),
  (SELECT (ss.paid_at)::date
     FROM public.single_sales ss
     JOIN public.package_appointments pa ON pa.package_id = ss.package_id
    WHERE pa.appointment_id = a.id
      AND ss.paid_at IS NOT NULL
    ORDER BY ss.paid_at ASC
    LIMIT 1),
  (a.start_time AT TIME ZONE 'America/Sao_Paulo')::date
)
WHERE a.amount_paid IS NOT NULL
  AND a.amount_paid > 0
  AND a.payment_date IS NULL;

-- Trigger: stamp payment_date when amount_paid first becomes > 0, and clear when reset to 0.
-- Does NOT auto-overwrite an existing payment_date on unrelated updates (status, reschedule, etc).
CREATE OR REPLACE FUNCTION public.appointments_stamp_payment_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First registration of any paid amount: stamp today (BRT) if not provided explicitly.
  IF (COALESCE(NEW.amount_paid, 0) > 0)
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.amount_paid, 0) = 0)
     AND NEW.payment_date IS NULL THEN
    NEW.payment_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;

  -- Payment fully reversed: clear the date so a future re-registration captures the real date.
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.amount_paid, 0) = 0
     AND COALESCE(OLD.amount_paid, 0) > 0 THEN
    NEW.payment_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_stamp_payment_date ON public.appointments;
CREATE TRIGGER trg_appointments_stamp_payment_date
BEFORE INSERT OR UPDATE OF amount_paid, payment_date ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_stamp_payment_date();
