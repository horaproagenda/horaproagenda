ALTER TABLE public.product_purchases
  ADD COLUMN IF NOT EXISTS payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text;

CREATE INDEX IF NOT EXISTS product_purchases_payment_method_id_idx ON public.product_purchases(payment_method_id);