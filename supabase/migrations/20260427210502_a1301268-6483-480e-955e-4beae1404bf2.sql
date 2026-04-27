CREATE TABLE IF NOT EXISTS public.client_credit_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  appointment_id UUID NULL,
  sale_id UUID NULL,
  transaction_type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  previous_balance NUMERIC NOT NULL DEFAULT 0,
  new_balance NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_credit_transactions_amount_nonnegative'
  ) THEN
    ALTER TABLE public.client_credit_transactions
    ADD CONSTRAINT client_credit_transactions_amount_nonnegative CHECK (amount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_credit_transactions_type_check'
  ) THEN
    ALTER TABLE public.client_credit_transactions
    ADD CONSTRAINT client_credit_transactions_type_check
    CHECK (transaction_type IN ('credit_added', 'credit_used', 'credit_adjustment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_credit_transactions_client_id
ON public.client_credit_transactions(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_credit_transactions_appointment_id
ON public.client_credit_transactions(appointment_id)
WHERE appointment_id IS NOT NULL;

DROP POLICY IF EXISTS "Staff can view client credit transactions" ON public.client_credit_transactions;
CREATE POLICY "Staff can view client credit transactions"
ON public.client_credit_transactions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
);

DROP POLICY IF EXISTS "Staff can create client credit transactions" ON public.client_credit_transactions;
CREATE POLICY "Staff can create client credit transactions"
ON public.client_credit_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can delete client credit transactions" ON public.client_credit_transactions;
CREATE POLICY "Admins can delete client credit transactions"
ON public.client_credit_transactions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));