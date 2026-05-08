
-- 1. access_logs: block UPDATE and DELETE
DROP POLICY IF EXISTS "access_logs_no_update" ON public.access_logs;
DROP POLICY IF EXISTS "access_logs_no_delete" ON public.access_logs;
CREATE POLICY "access_logs_no_update" ON public.access_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "access_logs_no_delete" ON public.access_logs FOR DELETE TO authenticated USING (false);

-- 2. audit_logs: block direct INSERT (rely on SECURITY DEFINER triggers)
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND cmd='INSERT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "audit_logs_no_direct_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "audit_logs_no_update" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_update" ON public.audit_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs FOR DELETE TO authenticated USING (false);

-- 3. supabase_migrations: admin-only INSERT
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='supabase_migrations' AND cmd='INSERT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.supabase_migrations', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "supabase_migrations_admin_insert" ON public.supabase_migrations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. trial_registrations: prevent privilege escalation via trigger
CREATE OR REPLACE FUNCTION public.prevent_trial_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.has_paid IS DISTINCT FROM OLD.has_paid
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_ended_at IS DISTINCT FROM OLD.trial_ended_at
     OR NEW.trial_days IS DISTINCT FROM OLD.trial_days
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.cnpj IS DISTINCT FROM OLD.cnpj
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
  THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar campos de assinatura, trial ou identificação.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_trial_self_escalation ON public.trial_registrations;
CREATE TRIGGER trg_prevent_trial_self_escalation
  BEFORE UPDATE ON public.trial_registrations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_trial_self_escalation();

-- 5. single_sales: allow professionals to see sales for their clients/appointments
DROP POLICY IF EXISTS "single_sales_professional_select" ON public.single_sales;
CREATE POLICY "single_sales_professional_select" ON public.single_sales
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    OR (client_id IS NOT NULL AND public.can_access_client_record(client_id))
  );
