
DROP POLICY IF EXISTS "Professionals can view own product purchases" ON public.product_purchases;
CREATE POLICY "Professionals can view own product purchases"
ON public.product_purchases FOR SELECT TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_purchases.product_id AND p.created_by = auth.uid())
);

DROP POLICY IF EXISTS "Professionals can insert own product purchases" ON public.product_purchases;
CREATE POLICY "Professionals can insert own product purchases"
ON public.product_purchases FOR INSERT TO authenticated
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can update own product purchases" ON public.product_purchases;
CREATE POLICY "Professionals can update own product purchases"
ON public.product_purchases FOR UPDATE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_purchases.product_id AND p.created_by = auth.uid())
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
);

DROP POLICY IF EXISTS "Professionals can delete own product purchases" ON public.product_purchases;
CREATE POLICY "Professionals can delete own product purchases"
ON public.product_purchases FOR DELETE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND professional_permission('can_manage_products')
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_purchases.product_id AND p.created_by = auth.uid())
);

DROP POLICY IF EXISTS "Professionals can insert own product consumption" ON public.product_daily_consumption;
CREATE POLICY "Professionals can insert own product consumption"
ON public.product_daily_consumption FOR INSERT TO authenticated
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can update own product consumption" ON public.product_daily_consumption;
CREATE POLICY "Professionals can update own product consumption"
ON public.product_daily_consumption FOR UPDATE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND created_by = auth.uid()
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can delete own product consumption" ON public.product_daily_consumption;
CREATE POLICY "Professionals can delete own product consumption"
ON public.product_daily_consumption FOR DELETE TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Professionals can manage own service products" ON public.service_products;
CREATE POLICY "Professionals can manage own service products"
ON public.service_products FOR ALL TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_products.service_id
      AND s.professional_id = get_professional_id_for_user(auth.uid())
  )
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_products.service_id
      AND s.professional_id = get_professional_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Professionals can manage own package template products" ON public.package_template_products;
CREATE POLICY "Professionals can manage own package template products"
ON public.package_template_products FOR ALL TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.package_templates t
    WHERE t.id = package_template_products.template_id
      AND t.professional_id = get_professional_id_for_user(auth.uid())
  )
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.package_templates t
    WHERE t.id = package_template_products.template_id
      AND t.professional_id = get_professional_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Professionals can manage own package template steps" ON public.package_template_steps;
CREATE POLICY "Professionals can manage own package template steps"
ON public.package_template_steps FOR ALL TO authenticated
USING (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.package_templates t
    WHERE t.id = package_template_steps.template_id
      AND t.professional_id = get_professional_id_for_user(auth.uid())
  )
)
WITH CHECK (
  account_owner_id = current_account_owner_id()
  AND has_role(auth.uid(), 'professional'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.package_templates t
    WHERE t.id = package_template_steps.template_id
      AND t.professional_id = get_professional_id_for_user(auth.uid())
  )
);
