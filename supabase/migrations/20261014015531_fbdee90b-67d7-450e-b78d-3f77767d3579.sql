DO $$
DECLARE r record; pa_id uuid;
BEGIN
  FOR r IN
    SELECT a.id appt, a.client_id, a.service_id, a.start_time,
      (SELECT array_agg(sp.id) FROM service_packages sp WHERE sp.client_id=a.client_id AND sp.is_active
         AND EXISTS (SELECT 1 FROM package_appointments pa WHERE pa.package_id=sp.id AND pa.service_id=a.service_id AND pa.appointment_id IS NULL)) pk
    FROM appointments a JOIN services s ON s.id=a.service_id
    WHERE coalesce(s.price,0)=0 AND a.status<>'cancelled' AND a.package_appointment_id IS NULL
  LOOP
    IF r.pk IS NULL OR array_length(r.pk,1) <> 1 THEN CONTINUE; END IF;
    SELECT pa.id INTO pa_id FROM package_appointments pa
      WHERE pa.package_id=r.pk[1] AND pa.service_id=r.service_id AND pa.appointment_id IS NULL
      ORDER BY pa.sequence_order NULLS LAST, pa.session_number LIMIT 1;
    IF pa_id IS NULL THEN CONTINUE; END IF;
    UPDATE package_appointments SET appointment_id=r.appt, status='scheduled', scheduled_date=r.start_time WHERE id=pa_id;
    UPDATE appointments SET package_appointment_id=pa_id WHERE id=r.appt;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_package_overpayment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_total numeric; v_extra numeric;
BEGIN
  IF NEW.package_appointment_id IS NULL OR coalesce(NEW.amount_paid,0) <= coalesce(OLD.amount_paid,0) THEN RETURN NEW; END IF;
  SELECT sp.total_price INTO v_total FROM package_appointments pa JOIN service_packages sp ON sp.id=pa.package_id WHERE pa.id=NEW.package_appointment_id;
  IF coalesce(v_total,0) <= 0 THEN RETURN NEW; END IF;
  SELECT coalesce(sum(total_amount),0) INTO v_extra FROM appointment_additional_items WHERE appointment_id=NEW.id;
  IF coalesce(NEW.amount_paid,0) > v_total + v_extra + 0.01 THEN
    RAISE EXCEPTION 'PACKAGE_OVERPAYMENT: o valor recebido ultrapassa o saldo do pacote' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_package_overpayment() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_package_overpayment ON public.appointments;
CREATE TRIGGER trg_guard_package_overpayment BEFORE UPDATE OF amount_paid ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.guard_package_overpayment();