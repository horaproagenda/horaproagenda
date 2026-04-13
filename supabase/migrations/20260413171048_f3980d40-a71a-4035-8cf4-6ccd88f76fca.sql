
-- Create boleto installments table
CREATE TABLE public.boleto_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.single_sales(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  total_installments integer NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(sale_id, installment_number)
);

-- Enable RLS
ALTER TABLE public.boleto_installments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view boleto installments"
  ON public.boleto_installments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create boleto installments"
  ON public.boleto_installments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update boleto installments"
  ON public.boleto_installments FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete boleto installments"
  ON public.boleto_installments FOR DELETE TO authenticated USING (true);

-- Updated_at trigger
CREATE TRIGGER update_boleto_installments_updated_at
  BEFORE UPDATE ON public.boleto_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
