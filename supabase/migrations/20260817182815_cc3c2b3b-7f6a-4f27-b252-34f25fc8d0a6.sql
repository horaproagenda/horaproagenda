
-- Helper: lê uma chave booleana do JSON de permissões do profissional logado
CREATE OR REPLACE FUNCTION public.professional_permission(_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((p.permissions ->> _key)::boolean, false)
  FROM public.professionals p
  WHERE p.user_id = auth.uid()
  ORDER BY p.created_at
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.professional_permission(text) TO authenticated;

-- ============ CLIENTES: profissional edita/exclui os próprios ============
DROP POLICY IF EXISTS "Professionals can update own clients" ON public.clients;
CREATE POLICY "Professionals can update own clients"
ON public.clients FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND assigned_professional_id = get_professional_id_for_user(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND assigned_professional_id = get_professional_id_for_user(auth.uid())
);

DROP POLICY IF EXISTS "Professionals can delete own clients" ON public.clients;
CREATE POLICY "Professionals can delete own clients"
ON public.clients FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND assigned_professional_id = get_professional_id_for_user(auth.uid())
);

-- ============ LEMBRETES: CRUD dos próprios ============
DROP POLICY IF EXISTS "Users can view own reminders" ON public.reminders;
CREATE POLICY "Users can view own reminders"
ON public.reminders FOR SELECT TO authenticated
USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can insert own reminders" ON public.reminders;
CREATE POLICY "Users can insert own reminders"
ON public.reminders FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update own reminders" ON public.reminders;
CREATE POLICY "Users can update own reminders"
ON public.reminders FOR UPDATE TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete own reminders" ON public.reminders;
CREATE POLICY "Users can delete own reminders"
ON public.reminders FOR DELETE TO authenticated
USING (created_by = auth.uid());

-- ============ PRODUTOS: profissional com can_manage_products ============
DROP POLICY IF EXISTS "Professionals can insert own products" ON public.products;
CREATE POLICY "Professionals can insert own products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can update own products" ON public.products;
CREATE POLICY "Professionals can update own products"
ON public.products FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can delete own products" ON public.products;
CREATE POLICY "Professionals can delete own products"
ON public.products FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND created_by = auth.uid()
);

-- ============ MODELOS DE PACOTE: CRUD dos próprios ============
DROP POLICY IF EXISTS "Professionals can insert own package templates" ON public.package_templates;
CREATE POLICY "Professionals can insert own package templates"
ON public.package_templates FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_id = get_professional_id_for_user(auth.uid())
);

DROP POLICY IF EXISTS "Professionals can update own package templates" ON public.package_templates;
CREATE POLICY "Professionals can update own package templates"
ON public.package_templates FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_id = get_professional_id_for_user(auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_id = get_professional_id_for_user(auth.uid())
);

DROP POLICY IF EXISTS "Professionals can delete own package templates" ON public.package_templates;
CREATE POLICY "Professionals can delete own package templates"
ON public.package_templates FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_id = get_professional_id_for_user(auth.uid())
);

-- SELECT de modelos de pacote: respeita a nova permissão
DROP POLICY IF EXISTS "Users can view package templates based on role" ON public.package_templates;
CREATE POLICY "Users can view package templates based on role"
ON public.package_templates FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR professional_id IS NULL
  OR professional_id = get_professional_id_for_user(auth.uid())
  OR professional_permission('can_view_other_services')
);

-- ============ SERVIÇOS: SELECT respeita a nova permissão ============
DROP POLICY IF EXISTS "Staff can view services" ON public.services;
CREATE POLICY "Staff can view services"
ON public.services FOR SELECT TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND is_tenant_staff()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
    OR professional_id IS NULL
    OR professional_id = get_professional_id_for_user(auth.uid())
    OR professional_permission('can_view_other_services')
  )
);

DROP POLICY IF EXISTS "Users can view services based on role" ON public.services;
CREATE POLICY "Users can view services based on role"
ON public.services FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'receptionist'::app_role)
  OR professional_id IS NULL
  OR professional_id = get_professional_id_for_user(auth.uid())
  OR professional_permission('can_view_other_services')
);

-- ============ FINANCEIRO: baixa de pagamento pelo profissional ============
DROP POLICY IF EXISTS "Professionals with payments permission can view entries" ON public.financial_entries;
CREATE POLICY "Professionals with payments permission can view entries"
ON public.financial_entries FOR SELECT TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND (
    professional_id = get_professional_id_for_user(auth.uid())
    OR created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Professionals with payments permission can insert entries" ON public.financial_entries;
CREATE POLICY "Professionals with payments permission can insert entries"
ON public.financial_entries FOR INSERT TO authenticated
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals with payments permission can update entries" ON public.financial_entries;
CREATE POLICY "Professionals with payments permission can update entries"
ON public.financial_entries FOR UPDATE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND (
    professional_id = get_professional_id_for_user(auth.uid())
    OR created_by = auth.uid()
  )
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
);

-- ============ VENDAS: profissional com baixa de pagamento ============
DROP POLICY IF EXISTS "Professionals with payments permission can view sales" ON public.single_sales;
CREATE POLICY "Professionals with payments permission can view sales"
ON public.single_sales FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals with payments permission can insert sales" ON public.single_sales;
CREATE POLICY "Professionals with payments permission can insert sales"
ON public.single_sales FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals with payments permission can update sales" ON public.single_sales;
CREATE POLICY "Professionals with payments permission can update sales"
ON public.single_sales FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_payments')
  AND created_by = auth.uid()
);
