-- Add credit_balance column to clients table
ALTER TABLE public.clients 
ADD COLUMN credit_balance numeric DEFAULT 0 NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.clients.credit_balance IS 'Saldo de crédito do cliente para usar em procedimentos';