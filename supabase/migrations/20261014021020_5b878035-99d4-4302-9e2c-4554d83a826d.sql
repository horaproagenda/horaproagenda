UPDATE public.single_sales ss SET payment_method_id = fe.payment_method_id
FROM public.financial_entries fe
WHERE ss.id='4fc21a32-4e6e-46b2-a649-e6e245a1d54f' AND fe.id='2797b503-9aa2-43b4-aac9-00fe2035e2d4' AND ss.payment_method_id IS NULL;
UPDATE public.financial_entries SET sale_id='4fc21a32-4e6e-46b2-a649-e6e245a1d54f'
WHERE id='2797b503-9aa2-43b4-aac9-00fe2035e2d4' AND sale_id IS NULL;

CREATE OR REPLACE FUNCTION public.link_package_payment_to_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_sale uuid;
BEGIN
  IF NEW.sale_id IS NOT NULL OR NEW.appointment_id IS NULL OR NEW.type <> 'receivable' OR NEW.status <> 'paid' THEN RETURN NEW; END IF;
  SELECT ss.id INTO v_sale
  FROM public.appointments a
  JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
  JOIN public.single_sales ss ON ss.package_id = pa.package_id AND ss.item_type='package'
  WHERE a.id = NEW.appointment_id AND ss.paid_at IS NULL AND coalesce(ss.notes,'') NOT ILIKE '%CANCELADO%'
    AND NOT EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = ss.id)
  ORDER BY ss.created_at LIMIT 1;
  IF v_sale IS NULL THEN RETURN NEW; END IF;
  NEW.sale_id := v_sale;
  -- Mesma transação: falhou aqui, a baixa inteira é desfeita.
  UPDATE public.single_sales SET payment_method_id = coalesce(payment_method_id, NEW.payment_method_id) WHERE id = v_sale;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.link_package_payment_to_sale() FROM public, anon, authenticated;
DROP TRIGGER IF EXISTS trg_link_package_payment_to_sale ON public.financial_entries;
CREATE TRIGGER trg_link_package_payment_to_sale BEFORE INSERT ON public.financial_entries FOR EACH ROW EXECUTE FUNCTION public.link_package_payment_to_sale();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_entries WHERE type='receivable' AND status='paid' AND appointment_id IS NOT NULL AND parent_entry_id IS NULL
    GROUP BY appointment_id, amount, paid_date HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_fe_paid_appointment_once
      ON public.financial_entries (appointment_id, amount, paid_date)
      WHERE type='receivable' AND status='paid' AND appointment_id IS NOT NULL AND parent_entry_id IS NULL;
  END IF;
END $$;