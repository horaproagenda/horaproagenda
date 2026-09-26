CREATE OR REPLACE FUNCTION public.sync_package_sale_from_appointments(_package_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int; v_paid int; v_date date; v_pm uuid; v_n int := 0;
BEGIN
  IF _package_id IS NULL THEN RETURN 0; END IF;
  SELECT count(*), count(*) FILTER (WHERE a.payment_status = 'paid'), max(a.payment_date)
    INTO v_total, v_paid, v_date
  FROM public.package_appointments pa JOIN public.appointments a ON a.id = pa.appointment_id
  WHERE pa.package_id = _package_id;
  IF v_total = 0 OR v_paid = 0 OR v_paid < v_total THEN RETURN 0; END IF;
  SELECT pm.id INTO v_pm FROM public.package_appointments pa
    JOIN public.appointments a ON a.id = pa.appointment_id
    JOIN public.payment_methods pm ON pm.name = (a.payment_methods->0->>'name')
  WHERE pa.package_id = _package_id AND a.payment_methods IS NOT NULL LIMIT 1;
  UPDATE public.single_sales s
     SET paid_at = COALESCE(v_date::timestamptz + interval '12 hours', now()),
         payment_method_id = COALESCE(s.payment_method_id, v_pm)
   WHERE s.package_id = _package_id AND s.paid_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = s.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
EXCEPTION WHEN others THEN
  RAISE WARNING 'sync_package_sale_from_appointments failed: %', SQLERRM;
  RETURN 0;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sync_package_sale_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pkg uuid;
BEGIN
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid') THEN
    SELECT package_id INTO v_pkg FROM public.package_appointments WHERE appointment_id = NEW.id LIMIT 1;
    IF v_pkg IS NOT NULL THEN PERFORM public.sync_package_sale_from_appointments(v_pkg); END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_package_sale_on_payment ON public.appointments;
CREATE TRIGGER trg_sync_package_sale_on_payment AFTER UPDATE OF payment_status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_package_sale_on_payment();

CREATE OR REPLACE FUNCTION public.heal_package_sales_payment()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v int := 0;
BEGIN
  FOR r IN SELECT DISTINCT s.package_id FROM public.single_sales s
    WHERE s.package_id IS NOT NULL AND s.paid_at IS NULL
      AND (auth.uid() IS NULL OR s.package_id IN (SELECT id FROM public.service_packages))
  LOOP v := v + public.sync_package_sale_from_appointments(r.package_id); END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.heal_package_sales_payment() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.heal_package_sales_payment() TO authenticated;
REVOKE ALL ON FUNCTION public.sync_package_sale_from_appointments(uuid) FROM anon, public, authenticated;

SELECT public.heal_package_sales_payment();