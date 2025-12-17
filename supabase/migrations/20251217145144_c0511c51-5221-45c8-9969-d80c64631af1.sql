-- Create payment methods table
CREATE TABLE public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Create financial categories table
CREATE TABLE public.financial_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense', -- 'income' or 'expense'
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Create financial entries table (contas a pagar/receber)
CREATE TABLE public.financial_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'receivable' (a receber) or 'payable' (a pagar)
  category_id UUID REFERENCES public.financial_categories(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'cancelled'
  payment_method_id UUID REFERENCES public.payment_methods(id),
  bank_id UUID REFERENCES public.banks(id),
  client_id UUID REFERENCES public.clients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  notes TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_day INTEGER, -- day of month for recurring
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Create single sales table (vendas unitárias)
CREATE TABLE public.single_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id),
  service_id UUID REFERENCES public.services(id),
  description TEXT,
  original_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  final_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method_id UUID REFERENCES public.payment_methods(id),
  bank_id UUID REFERENCES public.banks(id),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS on all tables
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.single_sales ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_methods
CREATE POLICY "Authenticated users can view payment_methods" ON public.payment_methods
  FOR SELECT USING (true);

CREATE POLICY "Admins and receptionists can insert payment_methods" ON public.payment_methods
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update payment_methods" ON public.payment_methods
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete payment_methods" ON public.payment_methods
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for financial_categories
CREATE POLICY "Authenticated users can view financial_categories" ON public.financial_categories
  FOR SELECT USING (true);

CREATE POLICY "Admins and receptionists can insert financial_categories" ON public.financial_categories
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update financial_categories" ON public.financial_categories
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete financial_categories" ON public.financial_categories
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for financial_entries
CREATE POLICY "Authenticated users can view financial_entries" ON public.financial_entries
  FOR SELECT USING (true);

CREATE POLICY "Admins and receptionists can insert financial_entries" ON public.financial_entries
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update financial_entries" ON public.financial_entries
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete financial_entries" ON public.financial_entries
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for single_sales
CREATE POLICY "Authenticated users can view single_sales" ON public.single_sales
  FOR SELECT USING (true);

CREATE POLICY "Admins and receptionists can insert single_sales" ON public.single_sales
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update single_sales" ON public.single_sales
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete single_sales" ON public.single_sales
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default payment methods
INSERT INTO public.payment_methods (name, description) VALUES
  ('PIX', 'Pagamento via PIX'),
  ('Cartão de Crédito', 'Pagamento em cartão de crédito'),
  ('Cartão de Débito', 'Pagamento em cartão de débito'),
  ('Dinheiro', 'Pagamento em espécie'),
  ('Transferência Bancária', 'Transferência entre contas'),
  ('Parcelado', 'Pagamento parcelado');