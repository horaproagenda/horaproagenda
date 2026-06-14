
-- 1. package_appointment_history: add account_owner_id + trigger + restrictive policy
ALTER TABLE public.package_appointment_history
  ADD COLUMN IF NOT EXISTS account_owner_id uuid;

UPDATE public.package_appointment_history h
SET account_owner_id = sp.account_owner_id
FROM public.service_packages sp
WHERE h.package_id = sp.id AND h.account_owner_id IS NULL;

ALTER TABLE public.package_appointment_history
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

-- Set NOT NULL only if no nulls remain
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.package_appointment_history WHERE account_owner_id IS NULL) THEN
    EXECUTE 'ALTER TABLE public.package_appointment_history ALTER COLUMN account_owner_id SET NOT NULL';
  END IF;
END $$;

DROP TRIGGER IF EXISTS autofill_account_owner_id ON public.package_appointment_history;
CREATE TRIGGER autofill_account_owner_id
  BEFORE INSERT ON public.package_appointment_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.package_appointment_history;
CREATE POLICY tenant_isolation_restrictive ON public.package_appointment_history
  AS RESTRICTIVE
  FOR ALL TO public
  USING (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id())
  WITH CHECK (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id());

CREATE INDEX IF NOT EXISTS idx_package_appointment_history_account_owner
  ON public.package_appointment_history(account_owner_id);

-- 2. payments_audit: add account_owner_id + trigger + restrictive policy + tighten INSERT
ALTER TABLE public.payments_audit
  ADD COLUMN IF NOT EXISTS account_owner_id uuid;

-- Best-effort backfill from clients
UPDATE public.payments_audit pa
SET account_owner_id = c.account_owner_id
FROM public.clients c
WHERE pa.client_id = c.id AND pa.account_owner_id IS NULL;

ALTER TABLE public.payments_audit
  ALTER COLUMN account_owner_id SET DEFAULT public.current_account_owner_id();

DROP TRIGGER IF EXISTS autofill_account_owner_id ON public.payments_audit;
CREATE TRIGGER autofill_account_owner_id
  BEFORE INSERT ON public.payments_audit
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.payments_audit;
CREATE POLICY tenant_isolation_restrictive ON public.payments_audit
  AS RESTRICTIVE
  FOR ALL TO public
  USING (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id())
  WITH CHECK (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id());

CREATE INDEX IF NOT EXISTS idx_payments_audit_account_owner
  ON public.payments_audit(account_owner_id);

-- 3. professional_whatsapp_credentials: add tenant_isolation_restrictive (defense in depth)
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.professional_whatsapp_credentials;
CREATE POLICY tenant_isolation_restrictive ON public.professional_whatsapp_credentials
  AS RESTRICTIVE
  FOR ALL TO public
  USING (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id())
  WITH CHECK (public.is_super_admin(auth.uid()) OR account_owner_id = public.current_account_owner_id());

-- 4. ultramsg_instance_pool: add explicit restrictive policy — super admin only
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.ultramsg_instance_pool;
CREATE POLICY tenant_isolation_restrictive ON public.ultramsg_instance_pool
  AS RESTRICTIVE
  FOR ALL TO public
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
