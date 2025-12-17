-- Add max_installments to payment_methods
ALTER TABLE public.payment_methods 
ADD COLUMN IF NOT EXISTS max_installments integer DEFAULT 1;

-- Add professional_id to financial_entries for tracking who receives pró-labore/vale
ALTER TABLE public.financial_entries 
ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professionals(id);

-- Remove "Materiais de Atendimento" category
DELETE FROM public.financial_categories WHERE name = 'Materiais de Atendimento';

-- Update payment methods - remove card_fee, keep only installment_fee for credit cards
-- card_fee will be repurposed or removed in the UI