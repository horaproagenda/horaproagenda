-- 1) Escopo de produtos do usuário logado
CREATE OR REPLACE FUNCTION public.product_scope_is_clinic()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_account_admin(auth.uid())
      OR public.has_role(auth.uid(), 'receptionist')
      OR public.professional_permission('can_manage_products');
$$;

-- 2) Dono do produto nas compras
ALTER TABLE public.product_purchases
  ADD COLUMN IF NOT EXISTS owner_professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL;

UPDATE public.product_purchases pp
   SET owner_professional_id = p.owner_professional_id
  FROM public.products p
 WHERE p.id = pp.product_id
   AND pp.owner_professional_id IS DISTINCT FROM p.owner_professional_id;

CREATE INDEX IF NOT EXISTS idx_product_purchases_owner_professional
  ON public.product_purchases(owner_professional_id);

CREATE OR REPLACE FUNCTION public.tg_product_purchase_fill_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT p.owner_professional_id INTO NEW.owner_professional_id
    FROM public.products p
   WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_purchases_fill_owner ON public.product_purchases;
CREATE TRIGGER product_purchases_fill_owner
  BEFORE INSERT OR UPDATE OF product_id ON public.product_purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_purchase_fill_owner();

-- 3) Produtos: profissional autorizado gerencia os produtos da clínica
DROP POLICY IF EXISTS "Clinic-product professionals can insert products" ON public.products;
CREATE POLICY "Clinic-product professionals can insert products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'professional')
    AND public.professional_permission('can_manage_products')
    AND owner_professional_id IS NULL
    AND account_owner_id = public.current_account_owner_id()
  );

DROP POLICY IF EXISTS "Clinic-product professionals can update products" ON public.products;
CREATE POLICY "Clinic-product professionals can update products"
  ON public.products FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'professional')
    AND public.professional_permission('can_manage_products')
    AND owner_professional_id IS NULL
  )
  WITH CHECK (owner_professional_id IS NULL);

DROP POLICY IF EXISTS "Clinic-product professionals can delete products" ON public.products;
CREATE POLICY "Clinic-product professionals can delete products"
  ON public.products FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'professional')
    AND public.professional_permission('can_manage_products')
    AND owner_professional_id IS NULL
  );

-- Estoques totalmente separados: quem tem produtos próprios só lê os seus
DROP POLICY IF EXISTS products_own_scope_isolation ON public.products;
CREATE POLICY products_own_scope_isolation
  ON public.products AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.product_scope_is_clinic()
    OR owner_professional_id IS NOT DISTINCT FROM public.get_professional_id_for_user(auth.uid())
  );

-- 4) Compras: mesmo escopo do produto
DROP POLICY IF EXISTS "Professionals can view own product purchases" ON public.product_purchases;
DROP POLICY IF EXISTS "Professionals can insert own product purchases" ON public.product_purchases;
DROP POLICY IF EXISTS "Professionals can update own product purchases" ON public.product_purchases;
DROP POLICY IF EXISTS "Professionals can delete own product purchases" ON public.product_purchases;

CREATE POLICY "Professionals can view purchases in their scope"
  ON public.product_purchases FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'professional')
    AND (
      owner_professional_id = public.get_professional_id_for_user(auth.uid())
      OR (owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
    )
  );

CREATE POLICY "Professionals can insert purchases in their scope"
  ON public.product_purchases FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'professional')
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = product_purchases.product_id
         AND (
           p.owner_professional_id = public.get_professional_id_for_user(auth.uid())
           OR (p.owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
         )
    )
  );

CREATE POLICY "Professionals can update purchases in their scope"
  ON public.product_purchases FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'professional')
    AND (
      owner_professional_id = public.get_professional_id_for_user(auth.uid())
      OR (owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
    )
  )
  WITH CHECK (
    owner_professional_id = public.get_professional_id_for_user(auth.uid())
    OR (owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
  );

CREATE POLICY "Professionals can delete purchases in their scope"
  ON public.product_purchases FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'professional')
    AND (
      owner_professional_id = public.get_professional_id_for_user(auth.uid())
      OR (owner_professional_id IS NULL AND public.professional_permission('can_manage_products'))
    )
  );

DROP POLICY IF EXISTS product_purchases_own_scope_isolation ON public.product_purchases;
CREATE POLICY product_purchases_own_scope_isolation
  ON public.product_purchases AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.product_scope_is_clinic()
    OR owner_professional_id IS NOT DISTINCT FROM public.get_professional_id_for_user(auth.uid())
  );

-- 5) Limpa as permissões removidas dos cadastros existentes
ALTER TABLE public.professionals DISABLE TRIGGER trg_prevent_professional_privilege_escalation;
ALTER TABLE public.professionals DISABLE TRIGGER trg_prevent_professional_self_privilege_escalation;

UPDATE public.professionals
   SET permissions = (permissions - 'can_view_other_products' - 'can_view_only_own_products')
                     || jsonb_build_object(
                          'can_manage_products', COALESCE((permissions->>'can_manage_products')::boolean, false),
                          'can_manage_own_products', NOT COALESCE((permissions->>'can_manage_products')::boolean, false)
                        )
 WHERE permissions IS NOT NULL
   AND app_role <> 'admin';

ALTER TABLE public.professionals ENABLE TRIGGER trg_prevent_professional_privilege_escalation;
ALTER TABLE public.professionals ENABLE TRIGGER trg_prevent_professional_self_privilege_escalation;