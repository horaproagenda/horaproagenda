
-- Create daily product consumption tracking table
CREATE TABLE public.product_daily_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  consumption_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity_used numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_daily_consumption ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view product consumption"
  ON public.product_daily_consumption FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and receptionists can insert product consumption"
  ON public.product_daily_consumption FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update product consumption"
  ON public.product_daily_consumption FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete product consumption"
  ON public.product_daily_consumption FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups
CREATE INDEX idx_product_daily_consumption_product_date 
  ON public.product_daily_consumption(product_id, consumption_date);

-- Trigger for updated_at
CREATE TRIGGER update_product_daily_consumption_updated_at
  BEFORE UPDATE ON public.product_daily_consumption
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
