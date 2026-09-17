DROP POLICY IF EXISTS "Only admins can insert cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Only admins can update cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Only admins can insert cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Only admins can update cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Only admins can insert financial entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Only admins can update financial entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Only admins can delete financial entries" ON public.financial_entries;