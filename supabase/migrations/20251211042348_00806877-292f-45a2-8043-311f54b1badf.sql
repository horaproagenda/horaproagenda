-- Add CPF column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf text;

-- Create index for CPF searches
CREATE INDEX IF NOT EXISTS idx_clients_cpf ON public.clients(cpf);