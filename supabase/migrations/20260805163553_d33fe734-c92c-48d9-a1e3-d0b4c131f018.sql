-- 1) financial_entries: explicit tenant scoping in every permissive policy
DROP POLICY IF EXISTS "Only admins can view financial entries" ON public.financial_entries;
CREATE POLICY "Only admins can view financial entries"
ON public.financial_entries FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS "Only admins can insert financial entries" ON public.financial_entries;
CREATE POLICY "Only admins can insert financial entries"
ON public.financial_entries FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS "Only admins can update financial entries" ON public.financial_entries;
CREATE POLICY "Only admins can update financial entries"
ON public.financial_entries FOR UPDATE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS "Only admins can delete financial entries" ON public.financial_entries;
CREATE POLICY "Only admins can delete financial entries"
ON public.financial_entries FOR DELETE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS "Admins can delete financial_entries" ON public.financial_entries;
CREATE POLICY "Admins can delete financial_entries"
ON public.financial_entries FOR DELETE TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS "Admins and receptionists can insert financial_entries" ON public.financial_entries;
CREATE POLICY "Admins and receptionists can insert financial_entries"
ON public.financial_entries FOR INSERT TO authenticated
WITH CHECK (
  (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'receptionist'::app_role))
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS "Admins and receptionists can update financial_entries" ON public.financial_entries;
CREATE POLICY "Admins and receptionists can update financial_entries"
ON public.financial_entries FOR UPDATE TO authenticated
USING (
  (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'receptionist'::app_role))
  AND account_owner_id = public.current_account_owner_id()
)
WITH CHECK (
  (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'receptionist'::app_role))
  AND account_owner_id = public.current_account_owner_id()
);

-- tenant restrictive: no NULL-owner write escape
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.financial_entries;
CREATE POLICY tenant_isolation_restrictive
ON public.financial_entries AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.current_account_owner_id())
WITH CHECK (account_owner_id = public.current_account_owner_id());

-- 2) whatsapp_pricing_config: align USING/WITH CHECK; admins read-only, super_admin writes
DROP POLICY IF EXISTS pricing_config_restrictive_gate ON public.whatsapp_pricing_config;

CREATE POLICY pricing_config_restrictive_read
ON public.whatsapp_pricing_config AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY pricing_config_restrictive_insert
ON public.whatsapp_pricing_config AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY pricing_config_restrictive_update
ON public.whatsapp_pricing_config AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY pricing_config_restrictive_delete
ON public.whatsapp_pricing_config AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_pricing_config FROM authenticated;
REVOKE ALL ON public.whatsapp_pricing_config FROM anon;

-- 3) whatsapp_send_queue: message bodies stay admin-only within the own account (write-only for others)
DROP POLICY IF EXISTS "Admins can view whatsapp queue" ON public.whatsapp_send_queue;
CREATE POLICY "Admins can view whatsapp queue"
ON public.whatsapp_send_queue FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

DROP POLICY IF EXISTS whatsapp_queue_select_restrictive ON public.whatsapp_send_queue;
CREATE POLICY whatsapp_queue_select_restrictive
ON public.whatsapp_send_queue AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND account_owner_id = public.current_account_owner_id()
);

REVOKE ALL ON public.whatsapp_send_queue FROM anon;