
-- Add commission configuration columns to professionals
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS commission_fixed_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_frequency text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS commission_payment_day integer DEFAULT 1;

-- commission_type: 'percentage' | 'fixed' | 'both' (per-service config)
-- commission_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
-- commission_payment_day: for monthly = day of month (1-31), for weekly/biweekly = day of week (0=Sun,6=Sat)

-- Create professional_service_commissions table for per-service commission config
CREATE TABLE IF NOT EXISTS public.professional_service_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  commission_type text NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
  commission_percentage numeric DEFAULT 0,
  commission_fixed_value numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(professional_id, service_id)
);

ALTER TABLE public.professional_service_commissions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view service commissions"
  ON public.professional_service_commissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can insert service commissions"
  ON public.professional_service_commissions FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update service commissions"
  ON public.professional_service_commissions FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete service commissions"
  ON public.professional_service_commissions FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_professional_service_commissions_updated_at
  BEFORE UPDATE ON public.professional_service_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
