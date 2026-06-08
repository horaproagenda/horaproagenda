
ALTER TABLE public.ultramsg_instance_pool
  ADD COLUMN IF NOT EXISTS monthly_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 9.00;
