-- 1) Colunas novas
ALTER TABLE public.card_brand_fees ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cash_registers_professional ON public.cash_registers(professional_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_professional ON public.cash_transactions(professional_id);

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.can_see_own_financial_record(_created_by uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE owner_prof uuid;
BEGIN
  IF _created_by IS NULL OR _created_by = auth.uid() THEN RETURN true; END IF;
  SELECT p.id INTO owner_prof FROM public.professionals p WHERE p.user_id = _created_by LIMIT 1;
  IF owner_prof IS NULL OR public.is_account_admin(_created_by) THEN RETURN true; END IF;
  IF NOT public.professional_share_flag(owner_prof, 'financeiro') THEN RETURN false; END IF;
  RETURN public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist');
END; $$;

CREATE OR REPLACE FUNCTION public.can_see_professional_register(_professional_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE mine uuid;
BEGIN
  IF _professional_id IS NULL THEN RETURN true; END IF;
  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NOT NULL AND mine = _professional_id THEN RETURN true; END IF;
  IF NOT public.professional_share_flag(_professional_id, 'financeiro') THEN RETURN false; END IF;
  RETURN public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist');
END; $$;

CREATE OR REPLACE FUNCTION public.can_use_financial_module()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_account_admin(auth.uid())
     OR public.has_role(auth.uid(), 'receptionist')
     OR public.professional_permission('can_access_financial');
$$;

CREATE OR REPLACE FUNCTION public.can_see_card_brand(_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT public.can_see_own_financial_record(b.created_by)
                   FROM public.card_brands b WHERE b.id = _brand_id), true);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_card_brand(_brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT (b.created_by = auth.uid())
                       OR (public.can_see_own_financial_record(b.created_by)
                           AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist')))
                   FROM public.card_brands b WHERE b.id = _brand_id), false);
$$;

-- 3) BANCOS
DROP POLICY IF EXISTS "Admins and receptionists can view banks" ON public.banks;
DROP POLICY IF EXISTS "Admins and receptionists can insert banks" ON public.banks;
DROP POLICY IF EXISTS "Admins and receptionists can update banks" ON public.banks;
DROP POLICY IF EXISTS "Admins can delete banks" ON public.banks;

CREATE POLICY "Financial users can view visible banks" ON public.banks FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_own_financial_record(created_by));

CREATE POLICY "Financial users can create banks" ON public.banks FOR INSERT TO authenticated
WITH CHECK (public.can_use_financial_module());

CREATE POLICY "Financial users can update visible banks" ON public.banks FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'))))
WITH CHECK (created_by = auth.uid() OR public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'));

CREATE POLICY "Financial users can delete own banks" ON public.banks FOR DELETE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND public.is_account_admin(auth.uid())));

-- 4) BANDEIRAS DE CARTÃO
DROP POLICY IF EXISTS "Staff can view card_brands of their tenant" ON public.card_brands;
DROP POLICY IF EXISTS "Admins and receptionists can insert card_brands" ON public.card_brands;
DROP POLICY IF EXISTS "Admins and receptionists can update card_brands" ON public.card_brands;
DROP POLICY IF EXISTS "Admins can delete card_brands" ON public.card_brands;

CREATE POLICY "Staff can view visible card_brands" ON public.card_brands FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_own_financial_record(created_by));

CREATE POLICY "Financial users can create card_brands" ON public.card_brands FOR INSERT TO authenticated
WITH CHECK (public.can_use_financial_module());

CREATE POLICY "Financial users can update visible card_brands" ON public.card_brands FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'))))
WITH CHECK (created_by = auth.uid() OR public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'));

CREATE POLICY "Financial users can delete own card_brands" ON public.card_brands FOR DELETE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND public.is_account_admin(auth.uid())));

-- 5) TAXAS DE CARTÃO
DROP POLICY IF EXISTS "Staff can view card_brand_fees of their tenant" ON public.card_brand_fees;
DROP POLICY IF EXISTS "Admins and receptionists can insert card_brand_fees" ON public.card_brand_fees;
DROP POLICY IF EXISTS "Admins and receptionists can update card_brand_fees" ON public.card_brand_fees;
DROP POLICY IF EXISTS "Admins can delete card_brand_fees" ON public.card_brand_fees;

CREATE POLICY "Staff can view visible card_brand_fees" ON public.card_brand_fees FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_card_brand(card_brand_id));

CREATE POLICY "Financial users can insert card_brand_fees" ON public.card_brand_fees FOR INSERT TO authenticated
WITH CHECK (public.can_use_financial_module() AND public.can_manage_card_brand(card_brand_id));

CREATE POLICY "Financial users can update card_brand_fees" ON public.card_brand_fees FOR UPDATE TO authenticated
USING (public.can_manage_card_brand(card_brand_id)) WITH CHECK (public.can_manage_card_brand(card_brand_id));

CREATE POLICY "Financial users can delete card_brand_fees" ON public.card_brand_fees FOR DELETE TO authenticated
USING (public.can_manage_card_brand(card_brand_id));

-- 6) BOLETOS PARCELADOS
DROP POLICY IF EXISTS "Staff can view boleto installments" ON public.boleto_installments;
DROP POLICY IF EXISTS "Staff can create boleto installments" ON public.boleto_installments;
DROP POLICY IF EXISTS "Staff can update boleto installments" ON public.boleto_installments;
DROP POLICY IF EXISTS "Staff can delete boleto installments" ON public.boleto_installments;

CREATE POLICY "Financial users can view visible boletos" ON public.boleto_installments FOR SELECT TO authenticated
USING (
  public.can_see_own_financial_record(created_by)
  AND (
    created_by = auth.uid()
    OR public.is_account_admin(auth.uid())
    OR public.has_role(auth.uid(),'receptionist')
    OR EXISTS (SELECT 1 FROM public.single_sales s WHERE s.id = sale_id AND public.can_access_client_record(s.client_id))
  )
);

CREATE POLICY "Financial users can create boletos" ON public.boleto_installments FOR INSERT TO authenticated
WITH CHECK (public.can_use_financial_module());

CREATE POLICY "Financial users can update visible boletos" ON public.boleto_installments FOR UPDATE TO authenticated
USING (
  public.can_see_own_financial_record(created_by)
  AND (created_by = auth.uid() OR public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist')
       OR public.professional_permission('can_manage_payments'))
)
WITH CHECK (public.can_use_financial_module());

CREATE POLICY "Financial users can delete visible boletos" ON public.boleto_installments FOR DELETE TO authenticated
USING (
  public.can_see_own_financial_record(created_by)
  AND (created_by = auth.uid() OR public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'))
);

-- 7) CAIXA: clínica x profissional
DROP POLICY IF EXISTS "Only admins can view cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Professionals with financial access can view cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Professionals can open cash registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Professionals can update cash registers" ON public.cash_registers;

CREATE POLICY "Staff can view visible cash registers" ON public.cash_registers FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_professional_register(professional_id));

CREATE POLICY "Professionals can open their own register" ON public.cash_registers FOR INSERT TO authenticated
WITH CHECK (
  (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid())
   AND (public.professional_permission('can_manage_own_register') OR public.professional_permission('can_open_close_register')))
  OR (professional_id IS NULL AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_open_close_register')))
);

CREATE POLICY "Professionals can update their own register" ON public.cash_registers FOR UPDATE TO authenticated
USING (
  (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid()))
  OR (professional_id IS NULL AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_open_close_register')))
)
WITH CHECK (
  (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid()))
  OR (professional_id IS NULL AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_open_close_register')))
);

DROP POLICY IF EXISTS "Only admins can view cash transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Professionals with payments permission can view cash tx" ON public.cash_transactions;
DROP POLICY IF EXISTS "Professionals with payments permission can insert cash tx" ON public.cash_transactions;
DROP POLICY IF EXISTS "Professionals with payments permission can update cash tx" ON public.cash_transactions;

CREATE POLICY "Staff can view visible cash transactions" ON public.cash_transactions FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_professional_register(professional_id));

CREATE POLICY "Financial users can insert cash transactions" ON public.cash_transactions FOR INSERT TO authenticated
WITH CHECK (
  (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid()) AND public.can_use_financial_module())
  OR (professional_id IS NULL AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_manage_payments')))
);

CREATE POLICY "Financial users can update cash transactions" ON public.cash_transactions FOR UPDATE TO authenticated
USING (
  (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid()))
  OR (professional_id IS NULL AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_manage_payments')))
)
WITH CHECK (
  (professional_id IS NOT NULL AND professional_id = public.get_professional_id_for_user(auth.uid()))
  OR (professional_id IS NULL AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_manage_payments')))
);