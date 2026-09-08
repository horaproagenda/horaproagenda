-- Rollback: restore helper definitions, policies and tenant-only unique indexes from preceding migrations.

CREATE OR REPLACE FUNCTION public.has_own_financial_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_account_admin(auth.uid())
      OR public.has_role(auth.uid(), 'receptionist')
      OR public.professional_permission('can_access_financial')
      OR public.professional_permission('can_manage_own_register');
$$;
REVOKE ALL ON FUNCTION public.has_own_financial_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_own_financial_access() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_see_record(
  _owner uuid,
  _visibility public.data_visibility,
  _module text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE mine uuid; scope text;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN RETURN true; END IF;
  mine := public.get_professional_id_for_user(auth.uid());
  IF _owner IS NOT NULL AND mine IS NOT NULL AND mine = _owner THEN RETURN true; END IF;

  IF _module = 'documentos' AND coalesce(_visibility, 'clinic') = 'clinic' THEN
    RETURN public.is_account_admin(auth.uid())
        OR public.has_role(auth.uid(), 'receptionist')
        OR public.professional_permission('can_view_all_documents');
  END IF;

  IF _owner IS NULL THEN RETURN true; END IF;
  IF coalesce(_visibility, 'clinic') = 'clinic' THEN RETURN true; END IF;
  IF NOT public.professional_share_flag(_owner, _module) THEN RETURN false; END IF;
  IF public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist') THEN RETURN true; END IF;

  scope := public.perm_scope(_module);
  RETURN CASE _visibility
    WHEN 'private' THEN false
    WHEN 'shared' THEN scope IN ('shared','unit','all') OR public.perm(_module, 'view_others')
    ELSE true
  END;
END;
$$;

-- Nomes iguais são permitidos em financeiros privados distintos.
DROP INDEX IF EXISTS public.uq_financial_categories_owner_name_type;
CREATE UNIQUE INDEX uq_financial_categories_owner_creator_name_type
ON public.financial_categories(account_owner_id, coalesce(created_by, account_owner_id), lower(trim(name)), type);
DROP INDEX IF EXISTS public.payment_methods_owner_name_unique;
CREATE UNIQUE INDEX payment_methods_owner_creator_name_unique
ON public.payment_methods(account_owner_id, coalesce(created_by, account_owner_id), lower(name));
DROP INDEX IF EXISTS public.card_brands_owner_name_unique;
CREATE UNIQUE INDEX card_brands_owner_creator_name_unique
ON public.card_brands(account_owner_id, coalesce(created_by, account_owner_id), lower(name));

DROP POLICY IF EXISTS "Financial users create own categories" ON public.financial_categories;
CREATE POLICY "Financial users create own categories" ON public.financial_categories
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Financial users create own payment methods" ON public.payment_methods;
CREATE POLICY "Financial users create own payment methods" ON public.payment_methods
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Financial users can create banks" ON public.banks;
CREATE POLICY "Financial users can create own banks" ON public.banks
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Financial users can create card_brands" ON public.card_brands;
CREATE POLICY "Financial users can create own card brands" ON public.card_brands
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Financial users can insert card_brand_fees" ON public.card_brand_fees;
CREATE POLICY "Financial users can insert own card brand fees" ON public.card_brand_fees
FOR INSERT TO authenticated
WITH CHECK (
  public.has_own_financial_access()
  AND created_by = auth.uid()
  AND public.can_manage_card_brand(card_brand_id)
);

DROP POLICY IF EXISTS "Financial users can create boletos" ON public.boleto_installments;
DROP POLICY IF EXISTS "Financial users can update visible boletos" ON public.boleto_installments;
DROP POLICY IF EXISTS "Financial users can delete visible boletos" ON public.boleto_installments;
CREATE POLICY "Financial users can create own boletos" ON public.boleto_installments
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());
CREATE POLICY "Financial users can update scoped boletos" ON public.boleto_installments
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR (public.can_see_own_financial_record(created_by) AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist')))
)
WITH CHECK (
  created_by = auth.uid()
  OR public.is_account_admin(auth.uid())
  OR public.has_role(auth.uid(),'receptionist')
);
CREATE POLICY "Financial users can delete scoped boletos" ON public.boleto_installments
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR (public.can_see_own_financial_record(created_by) AND public.is_account_admin(auth.uid()))
);

-- Financeiro próprio pode incluir lançamentos e baixas; caixa da clínica é outra permissão.
DROP POLICY IF EXISTS "Professionals can insert own financial entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Professionals can update own financial entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Professionals can delete own financial entries" ON public.financial_entries;
CREATE POLICY "Professionals can insert own financial entries" ON public.financial_entries
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'professional')
  AND public.has_own_financial_access()
  AND created_by=auth.uid()
  AND account_owner_id=public.current_account_owner_id()
);
CREATE POLICY "Professionals can update own financial entries" ON public.financial_entries
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'professional') AND public.has_own_financial_access() AND created_by=auth.uid())
WITH CHECK (created_by=auth.uid() AND account_owner_id=public.current_account_owner_id());
CREATE POLICY "Professionals can delete own financial entries" ON public.financial_entries
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'professional') AND public.has_own_financial_access() AND created_by=auth.uid());