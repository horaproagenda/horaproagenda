-- Create table for card brands
CREATE TABLE public.card_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit', -- 'credit', 'debit', 'both'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

-- Create table for card brand installment fees
CREATE TABLE public.card_brand_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_brand_id UUID NOT NULL REFERENCES public.card_brands(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL DEFAULT 1,
  fee_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.card_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_brand_fees ENABLE ROW LEVEL SECURITY;

-- RLS policies for card_brands
CREATE POLICY "Authenticated users can view card_brands" ON public.card_brands
FOR SELECT USING (true);

CREATE POLICY "Admins and receptionists can insert card_brands" ON public.card_brands
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update card_brands" ON public.card_brands
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete card_brands" ON public.card_brands
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for card_brand_fees
CREATE POLICY "Authenticated users can view card_brand_fees" ON public.card_brand_fees
FOR SELECT USING (true);

CREATE POLICY "Admins and receptionists can insert card_brand_fees" ON public.card_brand_fees
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins and receptionists can update card_brand_fees" ON public.card_brand_fees
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role));

CREATE POLICY "Admins can delete card_brand_fees" ON public.card_brand_fees
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default card brands
INSERT INTO public.card_brands (name, type) VALUES
('Visa', 'both'),
('Mastercard', 'both'),
('Elo', 'both'),
('American Express', 'both'),
('Hipercard', 'both'),
('Diners', 'credit'),
('Hiper', 'debit');

-- Add debit_fee to payment_methods for debit cards
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS debit_fee NUMERIC DEFAULT 0;