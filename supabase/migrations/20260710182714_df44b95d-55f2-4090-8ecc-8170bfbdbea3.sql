ALTER TABLE public.single_sales DISABLE TRIGGER reconcile_sale_payment_trigger;

UPDATE public.single_sales s
SET paid_at = COALESCE(
      (SELECT (max(b.paid_date)::text || 'T12:00:00')::timestamptz
       FROM public.boleto_installments b
       WHERE b.sale_id = s.id AND b.status = 'paid'),
      now()
    ),
    updated_at = now()
WHERE s.paid_at IS NULL
  AND EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = s.id AND b.status != 'cancelled')
  AND NOT EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = s.id AND b.status NOT IN ('paid','cancelled'));

ALTER TABLE public.single_sales ENABLE TRIGGER reconcile_sale_payment_trigger;

UPDATE public.service_packages sp
SET is_active = true, updated_at = now()
WHERE sp.is_active = false
  AND EXISTS (
    SELECT 1 FROM public.single_sales s
    WHERE s.package_id = sp.id
      AND EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = s.id AND b.status != 'cancelled')
      AND NOT EXISTS (SELECT 1 FROM public.boleto_installments b WHERE b.sale_id = s.id AND b.status NOT IN ('paid','cancelled'))
  );