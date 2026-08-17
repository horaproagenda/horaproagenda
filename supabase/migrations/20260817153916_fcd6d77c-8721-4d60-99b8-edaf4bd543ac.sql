ALTER TABLE public.product_purchases
  ADD COLUMN IF NOT EXISTS cycle_quantity numeric,
  ADD COLUMN IF NOT EXISTS cycle_appointments integer,
  ADD COLUMN IF NOT EXISTS avg_quantity_per_appointment numeric;