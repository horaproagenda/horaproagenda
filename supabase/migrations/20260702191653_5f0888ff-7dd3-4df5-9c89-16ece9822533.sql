
-- 1. Storage delete policy: add tenant ownership check
DROP POLICY IF EXISTS "Only admins can delete client protected files" ON storage.objects;
CREATE POLICY "Only admins can delete client protected files"
ON storage.objects FOR DELETE
USING (
  (bucket_id = ANY (ARRAY['client-photos'::text, 'client-documents'::text]))
  AND has_role(auth.uid(), 'admin'::app_role)
  AND can_access_client_storage_object(bucket_id, name)
);

-- 2. Tighten SELECT policies to include tenant scoping directly
DROP POLICY IF EXISTS "Authenticated users can view equipment" ON public.equipment;
CREATE POLICY "Authenticated users can view equipment"
ON public.equipment FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view payment_methods" ON public.payment_methods;
CREATE POLICY "Authenticated users can view payment_methods"
ON public.payment_methods FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view rooms" ON public.rooms;
CREATE POLICY "Authenticated users can view rooms"
ON public.rooms FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view service_products" ON public.service_products;
CREATE POLICY "Authenticated users can view service_products"
ON public.service_products FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view services" ON public.services;
CREATE POLICY "Authenticated users can view services"
ON public.services FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view financial_categories" ON public.financial_categories;
CREATE POLICY "Authenticated users can view financial_categories"
ON public.financial_categories FOR SELECT TO authenticated
USING (account_owner_id = current_account_owner_id() OR is_super_admin(auth.uid()));

-- 3. user_roles: prevent tenant admins from granting/revoking the 'admin' role directly.
-- Only super_admin can manage 'admin' or 'super_admin' roles. Tenant admins may manage
-- other roles (receptionist, professional) within their tenant.
DROP POLICY IF EXISTS "tenant_insert_user_roles" ON public.user_roles;
CREATE POLICY "tenant_insert_user_roles"
ON public.user_roles FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "tenant_update_user_roles" ON public.user_roles;
CREATE POLICY "tenant_update_user_roles"
ON public.user_roles FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role)
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "tenant_delete_user_roles" ON public.user_roles;
CREATE POLICY "tenant_delete_user_roles"
ON public.user_roles FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR (
    account_owner_id = current_account_owner_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role NOT IN ('super_admin'::app_role, 'admin'::app_role)
  )
);
