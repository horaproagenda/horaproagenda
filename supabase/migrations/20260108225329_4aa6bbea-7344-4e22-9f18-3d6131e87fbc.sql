-- Add card fee columns to cash_transactions table
ALTER TABLE public.cash_transactions 
ADD COLUMN IF NOT EXISTS card_fee_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1;

COMMENT ON COLUMN public.cash_transactions.card_fee_amount IS 'Card fee amount deducted by payment processor';
COMMENT ON COLUMN public.cash_transactions.installments IS 'Number of installments for card payments';