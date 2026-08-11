-- Helper: is the caller staff of the current tenant?
CREATE OR REPLACE FUNCTION public.is_tenant_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'receptionist'::app_role)
      OR public.has_role(auth.uid(), 'professional'::app_role)
$$;

-- equipment
DROP POLICY IF EXISTS "Authenticated users can view equipment" ON public.equipment;
CREATE POLICY "Staff can view equipment"
ON public.equipment FOR SELECT TO authenticated
USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

-- financial_categories
DROP POLICY IF EXISTS "Authenticated users can view financial_categories" ON public.financial_categories;
CREATE POLICY "Staff can view financial_categories"
ON public.financial_categories FOR SELECT TO authenticated
USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

-- payment_methods
DROP POLICY IF EXISTS "Authenticated users can view payment_methods" ON public.payment_methods;
CREATE POLICY "Staff can view payment_methods"
ON public.payment_methods FOR SELECT TO authenticated
USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

-- rooms (also drops super admin read branch)
DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.rooms;
CREATE POLICY "Staff can view rooms"
ON public.rooms FOR SELECT TO authenticated
USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

-- service_products (also drops super admin read branch)
DROP POLICY IF EXISTS "Authenticated users can view service_products" ON public.service_products;
CREATE POLICY "Staff can view service_products"
ON public.service_products FOR SELECT TO authenticated
USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());

-- services: remove super admin read branch, keep role-scoped policy
DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;
CREATE POLICY "Staff can view services"
ON public.services FOR SELECT TO authenticated
USING (account_owner_id = public.current_account_owner_id() AND public.is_tenant_staff());