-- Rollback: restore the previous policies/functions from the immediately preceding migrations.

CREATE OR REPLACE FUNCTION public.has_own_financial_access()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_account_admin(auth.uid())
      OR public.has_role(auth.uid(), 'receptionist')
      OR public.professional_permission('can_manage_own_register');
$$;

CREATE OR REPLACE FUNCTION public.can_see_own_financial_record(_created_by uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE owner_prof uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _created_by = auth.uid() THEN RETURN true; END IF;

  SELECT public.get_professional_id_by_user_or_email(_created_by)
    INTO owner_prof;

  -- Registros sem criador profissional pertencem à clínica. Profissionais só
  -- os veem quando receberam acesso explícito ao financeiro da clínica.
  IF _created_by IS NULL OR owner_prof IS NULL OR public.is_account_admin(_created_by) THEN
    RETURN public.is_account_admin(auth.uid())
        OR public.has_role(auth.uid(), 'receptionist')
        OR public.professional_permission('can_access_financial');
  END IF;

  -- Financeiro de um profissional nunca é visível a outro profissional.
  IF NOT (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist')) THEN
    RETURN false;
  END IF;

  RETURN public.professional_share_flag(owner_prof, 'financeiro');
END;
$$;

CREATE OR REPLACE FUNCTION public.can_see_financial_entry(
  _created_by uuid,
  _appointment_id uuid,
  _sale_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A origem em venda/agendamento não pode furar a privacidade do criador.
  RETURN public.can_see_own_financial_record(_created_by);
END;
$$;

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
  IF _owner IS NULL THEN RETURN true; END IF;

  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NOT NULL AND mine = _owner THEN RETURN true; END IF;

  -- A opção do cadastro profissional para documentos da clínica é adicional
  -- e independe da permissão de criar documentos próprios.
  IF _module = 'documentos'
     AND coalesce(_visibility, 'clinic') = 'clinic'
     AND public.professional_permission('can_view_all_documents') THEN
    RETURN true;
  END IF;

  IF coalesce(_visibility, 'clinic') = 'clinic' THEN RETURN true; END IF;
  IF NOT public.professional_share_flag(_owner, _module) THEN RETURN false; END IF;

  IF public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(), 'receptionist') THEN
    RETURN true;
  END IF;

  scope := public.perm_scope(_module);
  RETURN CASE _visibility
    WHEN 'private' THEN false
    WHEN 'shared' THEN scope IN ('shared','unit','all') OR public.perm(_module, 'view_others')
    ELSE true
  END;
END;
$$;

-- Financeiro pessoal: categorias.
DROP POLICY IF EXISTS "Admins can delete financial_categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Admins and receptionists can insert financial_categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Admins and receptionists can update financial_categories" ON public.financial_categories;
DROP POLICY IF EXISTS "Staff can view financial_categories" ON public.financial_categories;
CREATE POLICY "Financial users view scoped categories" ON public.financial_categories
FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_own_financial_record(created_by));
CREATE POLICY "Financial users create own categories" ON public.financial_categories
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());
CREATE POLICY "Financial users update scoped categories" ON public.financial_categories
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'))))
WITH CHECK (created_by = auth.uid() OR public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'));
CREATE POLICY "Financial users delete scoped categories" ON public.financial_categories
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND public.is_account_admin(auth.uid())));

-- Financeiro pessoal: formas de pagamento.
DROP POLICY IF EXISTS "Admins can delete payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Admins and receptionists can insert payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Admins and receptionists can update payment_methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Staff can view payment_methods" ON public.payment_methods;
CREATE POLICY "Financial users view scoped payment methods" ON public.payment_methods
FOR SELECT TO authenticated
USING (public.can_use_financial_module() AND public.can_see_own_financial_record(created_by));
CREATE POLICY "Financial users create own payment methods" ON public.payment_methods
FOR INSERT TO authenticated
WITH CHECK (public.has_own_financial_access() AND created_by = auth.uid());
CREATE POLICY "Financial users update scoped payment methods" ON public.payment_methods
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'))))
WITH CHECK (created_by = auth.uid() OR public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist'));
CREATE POLICY "Financial users delete scoped payment methods" ON public.payment_methods
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR (public.can_see_own_financial_record(created_by) AND public.is_account_admin(auth.uid())));

-- Financeiro pessoal: lançamentos.
DROP POLICY IF EXISTS "Professionals with payments permission can insert entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Professionals with payments permission can view entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Professionals with payments permission can update entries" ON public.financial_entries;
CREATE POLICY "Professionals can insert own financial entries" ON public.financial_entries
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'professional')
  AND (public.professional_permission('can_manage_own_register') OR public.professional_permission('can_manage_payments'))
  AND created_by = auth.uid()
  AND account_owner_id = public.current_account_owner_id()
);
CREATE POLICY "Professionals can view own financial entries" ON public.financial_entries
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'professional')
  AND public.can_use_financial_module()
  AND (created_by = auth.uid() OR professional_id = public.get_professional_id_for_user(auth.uid()))
);
CREATE POLICY "Professionals can update own financial entries" ON public.financial_entries
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'professional')
  AND (public.professional_permission('can_manage_own_register') OR public.professional_permission('can_manage_payments'))
  AND created_by = auth.uid()
)
WITH CHECK (created_by = auth.uid() AND account_owner_id = public.current_account_owner_id());
CREATE POLICY "Professionals can delete own financial entries" ON public.financial_entries
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'professional')
  AND public.professional_permission('can_manage_own_register')
  AND created_by = auth.uid()
);

-- Caixa: o botão abrir/fechar opera somente o caixa da clínica.
DROP POLICY IF EXISTS "Professionals can open their own register" ON public.cash_registers;
DROP POLICY IF EXISTS "Professionals can update their own register" ON public.cash_registers;
CREATE POLICY "Authorized staff can open clinic register" ON public.cash_registers
FOR INSERT TO authenticated
WITH CHECK (
  professional_id IS NULL
  AND opened_by = auth.uid()
  AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_open_close_register'))
);
CREATE POLICY "Authorized staff can update clinic register" ON public.cash_registers
FOR UPDATE TO authenticated
USING (
  professional_id IS NULL
  AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_open_close_register'))
)
WITH CHECK (
  professional_id IS NULL
  AND (public.is_account_admin(auth.uid()) OR public.has_role(auth.uid(),'receptionist') OR public.professional_permission('can_open_close_register'))
);

-- Produtos próprios: todo profissional pode administrar somente os seus.
DROP POLICY IF EXISTS "Professionals can insert own products" ON public.products;
DROP POLICY IF EXISTS "Professionals can update own products" ON public.products;
DROP POLICY IF EXISTS "Professionals can delete own products" ON public.products;
CREATE POLICY "Professionals can insert own products" ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'professional')
  AND created_by = auth.uid()
  AND owner_professional_id = public.get_professional_id_for_user(auth.uid())
  AND visibility = 'private'
);
CREATE POLICY "Professionals can update own products" ON public.products
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'professional') AND created_by = auth.uid())
WITH CHECK (created_by = auth.uid() AND owner_professional_id = public.get_professional_id_for_user(auth.uid()) AND visibility = 'private');
CREATE POLICY "Professionals can delete own products" ON public.products
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'professional') AND created_by = auth.uid());

DROP POLICY IF EXISTS "Professionals can view own product purchases" ON public.product_purchases;
DROP POLICY IF EXISTS "Professionals can insert own product purchases" ON public.product_purchases;
DROP POLICY IF EXISTS "Professionals can update own product purchases" ON public.product_purchases;
DROP POLICY IF EXISTS "Professionals can delete own product purchases" ON public.product_purchases;
CREATE POLICY "Professionals can view own product purchases" ON public.product_purchases
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'professional') AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.created_by=auth.uid()));
CREATE POLICY "Professionals can insert own product purchases" ON public.product_purchases
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'professional') AND created_by=auth.uid() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.created_by=auth.uid()));
CREATE POLICY "Professionals can update own product purchases" ON public.product_purchases
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'professional') AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.created_by=auth.uid()))
WITH CHECK (created_by=auth.uid() AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.created_by=auth.uid()));
CREATE POLICY "Professionals can delete own product purchases" ON public.product_purchases
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'professional') AND EXISTS (SELECT 1 FROM public.products p WHERE p.id=product_id AND p.created_by=auth.uid()));

-- Lembretes são sempre pessoais, inclusive para administrador e recepção.
DROP POLICY IF EXISTS "Staff can view reminders" ON public.reminders;
DROP POLICY IF EXISTS "Admins and receptionists can update reminders" ON public.reminders;
DROP POLICY IF EXISTS "Admins can delete reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;
CREATE POLICY "Users can view own reminders" ON public.reminders FOR SELECT TO authenticated USING (created_by=auth.uid());
CREATE POLICY "Users can insert own reminders" ON public.reminders FOR INSERT TO authenticated WITH CHECK (created_by=auth.uid());
CREATE POLICY "Users can update own reminders" ON public.reminders FOR UPDATE TO authenticated USING (created_by=auth.uid()) WITH CHECK (created_by=auth.uid());
CREATE POLICY "Users can delete own reminders" ON public.reminders FOR DELETE TO authenticated USING (created_by=auth.uid());

-- Documentos próprios + documentos gerais da clínica autorizados.
DROP POLICY IF EXISTS "Admins can insert document templates" ON public.document_templates;
DROP POLICY IF EXISTS "Admins can update document templates" ON public.document_templates;
DROP POLICY IF EXISTS "Admins can delete document templates" ON public.document_templates;
CREATE POLICY "Authorized users can insert document templates" ON public.document_templates
FOR INSERT TO authenticated
WITH CHECK (
  public.is_account_admin(auth.uid())
  OR public.has_role(auth.uid(),'receptionist')
  OR (
    public.has_role(auth.uid(),'professional')
    AND owner_professional_id=public.get_professional_id_for_user(auth.uid())
    AND visibility='private'
  )
);
CREATE POLICY "Authorized users can update document templates" ON public.document_templates
FOR UPDATE TO authenticated
USING (
  public.is_account_admin(auth.uid())
  OR public.has_role(auth.uid(),'receptionist')
  OR (public.has_role(auth.uid(),'professional') AND owner_professional_id=public.get_professional_id_for_user(auth.uid()))
)
WITH CHECK (
  public.is_account_admin(auth.uid())
  OR public.has_role(auth.uid(),'receptionist')
  OR (owner_professional_id=public.get_professional_id_for_user(auth.uid()) AND visibility='private')
);
CREATE POLICY "Authorized users can delete document templates" ON public.document_templates
FOR DELETE TO authenticated
USING (
  public.is_account_admin(auth.uid())
  OR (public.has_role(auth.uid(),'professional') AND owner_professional_id=public.get_professional_id_for_user(auth.uid()))
);

-- Força propriedade/privacidade sem aceitar identidade enviada pela interface.
CREATE OR REPLACE FUNCTION public.enforce_personal_product_document_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE mine uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  mine := public.get_professional_id_for_user(auth.uid());
  IF public.has_role(auth.uid(),'professional') AND mine IS NOT NULL THEN
    NEW.owner_professional_id := mine;
    NEW.visibility := 'private';
    IF TG_TABLE_NAME = 'products' THEN NEW.created_by := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_personal_product_owner ON public.products;
CREATE TRIGGER enforce_personal_product_owner BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_personal_product_document_owner();
DROP TRIGGER IF EXISTS enforce_personal_document_owner ON public.document_templates;
CREATE TRIGGER enforce_personal_document_owner BEFORE INSERT OR UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION public.enforce_personal_product_document_owner();