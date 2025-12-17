-- Criar tabela de bancos
CREATE TABLE public.banks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_number TEXT,
  agency TEXT,
  bank_code TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

-- Policies for banks
CREATE POLICY "Authenticated users can view banks" 
ON public.banks FOR SELECT 
USING (true);

CREATE POLICY "Admins and receptionists can insert banks" 
ON public.banks FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update banks" 
ON public.banks FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete banks" 
ON public.banks FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar tabela de transações de caixa
CREATE TABLE public.cash_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  bank_id UUID REFERENCES public.banks(id),
  reference_id UUID,
  reference_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for cash_transactions
CREATE POLICY "Authenticated users can view cash transactions" 
ON public.cash_transactions FOR SELECT 
USING (true);

CREATE POLICY "Admins and receptionists can insert cash transactions" 
ON public.cash_transactions FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update cash transactions" 
ON public.cash_transactions FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete cash transactions" 
ON public.cash_transactions FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Adicionar colunas ao cash_registers para fechamento detalhado
ALTER TABLE public.cash_registers
ADD COLUMN cash_amount NUMERIC DEFAULT 0,
ADD COLUMN check_amount NUMERIC DEFAULT 0,
ADD COLUMN bank_deposits JSONB DEFAULT '[]'::jsonb;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_banks_updated_at
BEFORE UPDATE ON public.banks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cash_transactions_updated_at
BEFORE UPDATE ON public.cash_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();