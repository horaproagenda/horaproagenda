
-- Tighten permissive SELECT policies to scope by tenant + role (defense in depth)

-- card_brands
DROP POLICY IF EXISTS "Authenticated users can view card_brands" ON public.card_brands;
CREATE POLICY "Staff can view card_brands of their tenant"
ON public.card_brands FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- card_brand_fees
DROP POLICY IF EXISTS "Authenticated users can view card_brand_fees" ON public.card_brand_fees;
CREATE POLICY "Staff can view card_brand_fees of their tenant"
ON public.card_brand_fees FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- document_templates
DROP POLICY IF EXISTS "Authenticated users can view document templates" ON public.document_templates;
CREATE POLICY "Staff can view document templates of their tenant"
ON public.document_templates FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- package_template_steps
DROP POLICY IF EXISTS "Authenticated users can view package template steps" ON public.package_template_steps;
CREATE POLICY "Staff can view package template steps of their tenant"
ON public.package_template_steps FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- package_template_products
DROP POLICY IF EXISTS "Package template products are viewable by authenticated users" ON public.package_template_products;
CREATE POLICY "Staff can view package template products of their tenant"
ON public.package_template_products FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- product_purchases
DROP POLICY IF EXISTS "Authenticated staff can view product purchases" ON public.product_purchases;
CREATE POLICY "Staff can view product purchases of their tenant"
ON public.product_purchases FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- products
DROP POLICY IF EXISTS "Authenticated staff can view products" ON public.products;
CREATE POLICY "Staff can view products of their tenant"
ON public.products FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);

-- professional_absences
DROP POLICY IF EXISTS "Authenticated users can view professional absences" ON public.professional_absences;
CREATE POLICY "Staff can view professional absences of their tenant"
ON public.professional_absences FOR SELECT TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'professional'::app_role)
  )
);
