-- Rollback: restore can_see_professional_register and cash transaction policies from preceding migrations.
CREATE OR REPLACE FUNCTION public.can_see_professional_register(_professional_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE mine uuid;
BEGIN
  IF _professional_id IS NULL THEN
    RETURN public.is_account_admin(auth.uid())
        OR public.has_role(auth.uid(), 'receptionist')
        OR public.professional_permission('can_open_close_register')
        OR public.professional_permission('can_manage_payments');
  END IF;

  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NOT NULL AND mine = _professional_id THEN RETURN true; END IF;
  IF NOT public.professional_share_flag(_professional_id, 'financeiro') THEN RETURN false; END IF;
  RETURN public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist');
END;
$$;

DROP POLICY IF EXISTS "Financial users can insert cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Financial users can update cash transactions" ON public.cash_transactions;
CREATE POLICY "Authorized staff can insert clinic cash transactions" ON public.cash_transactions
FOR INSERT TO authenticated
WITH CHECK (
  professional_id IS NULL
  AND created_by = auth.uid()
  AND (
    public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(),'receptionist')
    OR public.professional_permission('can_open_close_register')
    OR public.professional_permission('can_manage_payments')
  )
);
CREATE POLICY "Authorized staff can update clinic cash transactions" ON public.cash_transactions
FOR UPDATE TO authenticated
USING (
  professional_id IS NULL
  AND (
    public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(),'receptionist')
    OR public.professional_permission('can_open_close_register')
    OR public.professional_permission('can_manage_payments')
  )
)
WITH CHECK (professional_id IS NULL);

DROP POLICY IF EXISTS "Admins and receptionists can view cash_register_entries" ON public.cash_register_entries;
DROP POLICY IF EXISTS "Admins and receptionists can insert cash_register_entries" ON public.cash_register_entries;
CREATE POLICY "Authorized staff can view clinic cash entries" ON public.cash_register_entries
FOR SELECT TO authenticated
USING (
  public.is_account_admin(auth.uid())
  OR public.has_role(auth.uid(),'receptionist')
  OR public.professional_permission('can_open_close_register')
  OR public.professional_permission('can_manage_payments')
);
CREATE POLICY "Authorized staff can insert clinic cash entries" ON public.cash_register_entries
FOR INSERT TO authenticated
WITH CHECK (
  public.is_account_admin(auth.uid())
  OR public.has_role(auth.uid(),'receptionist')
  OR public.professional_permission('can_open_close_register')
  OR public.professional_permission('can_manage_payments')
);