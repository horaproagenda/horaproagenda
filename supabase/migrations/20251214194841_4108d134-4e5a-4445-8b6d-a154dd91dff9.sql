-- Create cash_registers table to track opening/closing of cash registers
CREATE TABLE public.cash_registers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC,
  expected_balance NUMERIC,
  difference NUMERIC,
  total_received NUMERIC DEFAULT 0,
  total_receivables NUMERIC DEFAULT 0,
  payments_count INTEGER DEFAULT 0,
  payment_breakdown JSONB DEFAULT '{}',
  notes TEXT,
  opened_by UUID REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view cash registers"
ON public.cash_registers
FOR SELECT
USING (true);

CREATE POLICY "Admins and receptionists can insert cash registers"
ON public.cash_registers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update cash registers"
ON public.cash_registers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete cash registers"
ON public.cash_registers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_cash_registers_updated_at
BEFORE UPDATE ON public.cash_registers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();