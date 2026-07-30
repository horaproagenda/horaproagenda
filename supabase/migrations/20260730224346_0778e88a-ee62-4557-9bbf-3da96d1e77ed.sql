-- audit_log: remove tautological clause from super admin SELECT policy.
DROP POLICY IF EXISTS "Super admins can view audit_log" ON public.audit_log;
CREATE POLICY "Super admins can view audit_log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  AND account_owner_id = current_account_owner_id()
);

-- card_brand_fees: make tenant scope explicit on writes.
DROP POLICY IF EXISTS "Admins and receptionists can insert card_brand_fees" ON public.card_brand_fees;
CREATE POLICY "Admins and receptionists can insert card_brand_fees"
ON public.card_brand_fees
FOR INSERT
TO authenticated
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role))
);

DROP POLICY IF EXISTS "Admins and receptionists can update card_brand_fees" ON public.card_brand_fees;
CREATE POLICY "Admins and receptionists can update card_brand_fees"
ON public.card_brand_fees
FOR UPDATE
TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role))
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'receptionist'::app_role))
);

DROP POLICY IF EXISTS "Admins can delete card_brand_fees" ON public.card_brand_fees;
CREATE POLICY "Admins can delete card_brand_fees"
ON public.card_brand_fees
FOR DELETE
TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);