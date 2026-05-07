
CREATE POLICY "Professionals can view their clients credit transactions"
ON public.client_credit_transactions
FOR SELECT
TO authenticated
USING (public.can_access_client_record(client_id));
