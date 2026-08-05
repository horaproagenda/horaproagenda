DROP POLICY IF EXISTS "Authenticated users can view financial_categories" ON public.financial_categories;
CREATE POLICY "Authenticated users can view financial_categories"
ON public.financial_categories FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id());

DROP POLICY IF EXISTS "Authenticated users can view equipment" ON public.equipment;
CREATE POLICY "Authenticated users can view equipment"
ON public.equipment FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id());

DROP POLICY IF EXISTS "Authenticated users can view payment_methods" ON public.payment_methods;
CREATE POLICY "Authenticated users can view payment_methods"
ON public.payment_methods FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id());