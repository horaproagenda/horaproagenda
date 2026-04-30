ALTER TABLE public.client_credit_transactions
  ADD COLUMN IF NOT EXISTS professional_id UUID NULL REFERENCES public.professionals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_credit_transactions_professional_id
  ON public.client_credit_transactions(professional_id)
  WHERE professional_id IS NOT NULL;