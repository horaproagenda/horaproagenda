-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.professional_employment_type AS ENUM ('independente','comissionado','funcionario','administrador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_movement_type AS ENUM ('entrada','saida','transferencia','estorno','ajuste');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_movement_status AS ENUM ('pendente','confirmado','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.commission_payment_rule AS ENUM ('no_atendimento','no_pagamento','proporcional_parcelas');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.commission_status AS ENUM ('pendente','disponivel','pago');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_financial_model AS ENUM ('independente','comissionado','clinica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ CODES / TYPE ============
CREATE OR REPLACE FUNCTION public.short_code(_seed uuid, _prefix text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _prefix || upper(substr(replace(_seed::text,'-',''),1,8));
$$;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS clinic_code text;

UPDATE public.business_settings
   SET clinic_code = public.short_code(account_owner_id, 'CL-')
 WHERE clinic_code IS NULL AND account_owner_id IS NOT NULL;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS employment_type public.professional_employment_type,
  ADD COLUMN IF NOT EXISTS public_code text;

UPDATE public.professionals
   SET employment_type = CASE
        WHEN app_role = 'admin' THEN 'administrador'::public.professional_employment_type
        WHEN COALESCE((permissions->>'can_access_financial')::boolean, false)
          OR COALESCE((permissions->>'can_manage_own_register')::boolean, false)
          THEN 'independente'::public.professional_employment_type
        WHEN COALESCE(is_commission_based, false) THEN 'comissionado'::public.professional_employment_type
        ELSE 'funcionario'::public.professional_employment_type
       END
 WHERE employment_type IS NULL;

ALTER TABLE public.professionals
  ALTER COLUMN employment_type SET DEFAULT 'funcionario'::public.professional_employment_type;

UPDATE public.professionals
   SET public_code = public.short_code(id, 'PR-')
 WHERE public_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS professionals_public_code_key ON public.professionals(public_code);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS financial_model public.appointment_financial_model
  DEFAULT 'clinica'::public.appointment_financial_model;

-- ============ FINANCIAL ACCOUNTS ============
CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  name text NOT NULL,
  public_code text,
  is_clinic boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_clinic_uniq
  ON public.financial_accounts(account_owner_id) WHERE professional_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_professional_uniq
  ON public.financial_accounts(professional_id) WHERE professional_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

-- ============ MOVEMENTS ============
CREATE TABLE IF NOT EXISTS public.financial_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  cash_session_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  movement_type public.financial_movement_type NOT NULL,
  amount numeric(14,2) NOT NULL,
  category text,
  payment_method text,
  description text,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  status public.financial_movement_status NOT NULL DEFAULT 'confirmado',
  transfer_group_id uuid,
  counterpart_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  counterpart_movement_id uuid REFERENCES public.financial_movements(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS financial_movements_account_idx ON public.financial_movements(financial_account_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS financial_movements_tenant_idx ON public.financial_movements(account_owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_movements TO authenticated;
GRANT ALL ON public.financial_movements TO service_role;
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;

-- ============ CHARGES ============
CREATE TABLE IF NOT EXISTS public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  total_amount numeric(14,2) NOT NULL,
  installments_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.charge_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  paid_date date,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (charge_id, installment_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_installments TO authenticated;
GRANT ALL ON public.charge_installments TO service_role;
ALTER TABLE public.charge_installments ENABLE ROW LEVEL SECURITY;

-- ============ COMMISSION RULES / COMMISSIONS ============
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  clinic_percentage numeric(5,2) NOT NULL DEFAULT 0,
  professional_percentage numeric(5,2) NOT NULL DEFAULT 0,
  deduct_materials boolean NOT NULL DEFAULT false,
  deduct_fees boolean NOT NULL DEFAULT false,
  payment_rule public.commission_payment_rule NOT NULL DEFAULT 'no_pagamento',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_rules TO service_role;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  charge_installment_id uuid REFERENCES public.charge_installments(id) ON DELETE SET NULL,
  commission_rule_id uuid REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  clinic_amount numeric(14,2) NOT NULL DEFAULT 0,
  professional_amount numeric(14,2) NOT NULL DEFAULT 0,
  materials_amount numeric(14,2) NOT NULL DEFAULT 0,
  fees_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.commission_status NOT NULL DEFAULT 'pendente',
  released_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- ============ RECEPTION GRANTS ============
CREATE TABLE IF NOT EXISTS public.receptionist_professional_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  receptionist_professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receptionist_professional_id, professional_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receptionist_professional_grants TO authenticated;
GRANT ALL ON public.receptionist_professional_grants TO service_role;
ALTER TABLE public.receptionist_professional_grants ENABLE ROW LEVEL SECURITY;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.my_professional_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_professional_id_for_user(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.my_employment_type()
RETURNS public.professional_employment_type
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT employment_type FROM public.professionals WHERE id = public.my_professional_id();
$$;

CREATE OR REPLACE FUNCTION public.can_see_financial_account(_account_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.financial_accounts;
BEGIN
  SELECT * INTO a FROM public.financial_accounts WHERE id = _account_id;
  IF a.id IS NULL THEN RETURN false; END IF;
  IF a.account_owner_id <> public.get_user_account_owner_id(auth.uid()) THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN true; END IF;
  IF a.professional_id IS NOT NULL AND a.professional_id = public.my_professional_id() THEN RETURN true; END IF;
  IF a.professional_id IS NULL AND public.has_role(auth.uid(), 'receptionist') THEN RETURN true; END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.can_use_financial_account(_account_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.financial_accounts;
BEGIN
  SELECT * INTO a FROM public.financial_accounts WHERE id = _account_id;
  IF a.id IS NULL THEN RETURN false; END IF;
  IF a.account_owner_id <> public.get_user_account_owner_id(auth.uid()) THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN true; END IF;
  IF a.professional_id IS NOT NULL AND a.professional_id = public.my_professional_id() THEN RETURN true; END IF;
  IF a.professional_id IS NULL AND public.has_role(auth.uid(), 'receptionist') THEN RETURN true; END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_financial_accounts(_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.financial_accounts (account_owner_id, professional_id, name, public_code, is_clinic)
  VALUES (_owner, NULL, 'Conta da clínica', public.short_code(_owner, 'FA-'), true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.financial_accounts (account_owner_id, professional_id, name, public_code, is_clinic)
  SELECT p.account_owner_id, p.id, 'Conta de ' || p.name, public.short_code(p.id, 'FA-'), false
    FROM public.professionals p
   WHERE p.account_owner_id = _owner
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.professionals_after_insert_financial_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.public_code IS NULL THEN
    UPDATE public.professionals SET public_code = public.short_code(NEW.id, 'PR-') WHERE id = NEW.id;
  END IF;
  INSERT INTO public.financial_accounts (account_owner_id, professional_id, name, public_code, is_clinic)
  VALUES (NEW.account_owner_id, NEW.id, 'Conta de ' || NEW.name, public.short_code(NEW.id, 'FA-'), false)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.financial_accounts (account_owner_id, professional_id, name, public_code, is_clinic)
  VALUES (NEW.account_owner_id, NULL, 'Conta da clínica', public.short_code(NEW.account_owner_id, 'FA-'), true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS professionals_financial_account_trg ON public.professionals;
CREATE TRIGGER professionals_financial_account_trg
AFTER INSERT ON public.professionals
FOR EACH ROW EXECUTE FUNCTION public.professionals_after_insert_financial_account();

-- backfill accounts for existing tenants
DO $$
DECLARE o uuid;
BEGIN
  FOR o IN SELECT DISTINCT account_owner_id FROM public.professionals WHERE account_owner_id IS NOT NULL LOOP
    PERFORM public.ensure_financial_accounts(o);
  END LOOP;
END $$;

-- ============ TRANSFER PAIR ============
CREATE OR REPLACE FUNCTION public.financial_movements_transfer_pair()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE mirror_id uuid;
BEGIN
  IF NEW.movement_type <> 'transferencia' OR NEW.counterpart_account_id IS NULL
     OR NEW.counterpart_movement_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.financial_movements (
    account_owner_id, financial_account_id, cash_session_id, professional_id, appointment_id,
    movement_type, amount, category, payment_method, description, movement_date, created_by,
    status, transfer_group_id, counterpart_account_id, counterpart_movement_id
  ) VALUES (
    NEW.account_owner_id, NEW.counterpart_account_id, NEW.cash_session_id, NEW.professional_id, NEW.appointment_id,
    'transferencia', abs(NEW.amount), NEW.category, NEW.payment_method, NEW.description, NEW.movement_date, NEW.created_by,
    NEW.status, COALESCE(NEW.transfer_group_id, NEW.id), NEW.financial_account_id, NEW.id
  ) RETURNING id INTO mirror_id;

  UPDATE public.financial_movements
     SET counterpart_movement_id = mirror_id,
         transfer_group_id = COALESCE(transfer_group_id, NEW.id),
         amount = -abs(NEW.amount)
   WHERE id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS financial_movements_transfer_pair_trg ON public.financial_movements;
CREATE TRIGGER financial_movements_transfer_pair_trg
AFTER INSERT ON public.financial_movements
FOR EACH ROW EXECUTE FUNCTION public.financial_movements_transfer_pair();

-- ============ COMMISSION RELEASE ON INSTALLMENT PAID ============
CREATE OR REPLACE FUNCTION public.release_commissions_on_installment_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pago' AND COALESCE(OLD.status,'') <> 'pago' THEN
    UPDATE public.commissions
       SET status = 'disponivel', released_at = now(), updated_at = now()
     WHERE charge_installment_id = NEW.id AND status = 'pendente';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS charge_installments_release_commissions_trg ON public.charge_installments;
CREATE TRIGGER charge_installments_release_commissions_trg
AFTER UPDATE ON public.charge_installments
FOR EACH ROW EXECUTE FUNCTION public.release_commissions_on_installment_paid();

-- ============ updated_at + tenant default ============
CREATE OR REPLACE FUNCTION public.set_tenant_and_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_owner_id IS NULL THEN
      NEW.account_owner_id := public.get_user_account_owner_id(auth.uid());
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financial_accounts','financial_movements','charges','charge_installments','commission_rules','commissions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_tenant_ts_trg ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_tenant_ts_trg BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_and_timestamp()', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_tenant_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_owner_id IS NULL THEN
    NEW.account_owner_id := public.get_user_account_owner_id(auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS receptionist_grants_tenant_trg ON public.receptionist_professional_grants;
CREATE TRIGGER receptionist_grants_tenant_trg
BEFORE INSERT ON public.receptionist_professional_grants
FOR EACH ROW EXECUTE FUNCTION public.set_tenant_only();

-- ============ POLICIES ============
-- financial_accounts
DROP POLICY IF EXISTS financial_accounts_tenant ON public.financial_accounts;
CREATE POLICY financial_accounts_tenant ON public.financial_accounts
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS financial_accounts_select ON public.financial_accounts;
CREATE POLICY financial_accounts_select ON public.financial_accounts
FOR SELECT TO authenticated
USING (public.can_see_financial_account(id));

DROP POLICY IF EXISTS financial_accounts_admin_write ON public.financial_accounts;
CREATE POLICY financial_accounts_admin_write ON public.financial_accounts
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- financial_movements
DROP POLICY IF EXISTS financial_movements_tenant ON public.financial_movements;
CREATE POLICY financial_movements_tenant ON public.financial_movements
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS financial_movements_select ON public.financial_movements;
CREATE POLICY financial_movements_select ON public.financial_movements
FOR SELECT TO authenticated
USING (public.can_see_financial_account(financial_account_id));

DROP POLICY IF EXISTS financial_movements_insert ON public.financial_movements;
CREATE POLICY financial_movements_insert ON public.financial_movements
FOR INSERT TO authenticated
WITH CHECK (public.can_use_financial_account(financial_account_id));

DROP POLICY IF EXISTS financial_movements_update ON public.financial_movements;
CREATE POLICY financial_movements_update ON public.financial_movements
FOR UPDATE TO authenticated
USING (public.can_use_financial_account(financial_account_id))
WITH CHECK (public.can_use_financial_account(financial_account_id));

DROP POLICY IF EXISTS financial_movements_delete ON public.financial_movements;
CREATE POLICY financial_movements_delete ON public.financial_movements
FOR DELETE TO authenticated
USING (public.can_use_financial_account(financial_account_id));

-- charges
DROP POLICY IF EXISTS charges_tenant ON public.charges;
CREATE POLICY charges_tenant ON public.charges
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS charges_access ON public.charges;
CREATE POLICY charges_access ON public.charges
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR professional_id = public.my_professional_id()
  OR (public.has_role(auth.uid(), 'receptionist') AND (
        professional_id IS NULL OR EXISTS (
          SELECT 1 FROM public.receptionist_professional_grants g
           WHERE g.receptionist_professional_id = public.my_professional_id()
             AND g.professional_id = charges.professional_id)))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR professional_id = public.my_professional_id()
  OR (public.has_role(auth.uid(), 'receptionist') AND (
        professional_id IS NULL OR EXISTS (
          SELECT 1 FROM public.receptionist_professional_grants g
           WHERE g.receptionist_professional_id = public.my_professional_id()
             AND g.professional_id = charges.professional_id)))
);

-- charge_installments
DROP POLICY IF EXISTS charge_installments_tenant ON public.charge_installments;
CREATE POLICY charge_installments_tenant ON public.charge_installments
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS charge_installments_access ON public.charge_installments;
CREATE POLICY charge_installments_access ON public.charge_installments
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_installments.charge_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.charges c WHERE c.id = charge_installments.charge_id));

-- commission_rules
DROP POLICY IF EXISTS commission_rules_tenant ON public.commission_rules;
CREATE POLICY commission_rules_tenant ON public.commission_rules
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS commission_rules_admin ON public.commission_rules;
CREATE POLICY commission_rules_admin ON public.commission_rules
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS commission_rules_own_select ON public.commission_rules;
CREATE POLICY commission_rules_own_select ON public.commission_rules
FOR SELECT TO authenticated
USING (professional_id = public.my_professional_id());

-- commissions
DROP POLICY IF EXISTS commissions_tenant ON public.commissions;
CREATE POLICY commissions_tenant ON public.commissions
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS commissions_admin ON public.commissions;
CREATE POLICY commissions_admin ON public.commissions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS commissions_own_select ON public.commissions;
CREATE POLICY commissions_own_select ON public.commissions
FOR SELECT TO authenticated
USING (professional_id = public.my_professional_id());

-- receptionist grants
DROP POLICY IF EXISTS receptionist_grants_tenant ON public.receptionist_professional_grants;
CREATE POLICY receptionist_grants_tenant ON public.receptionist_professional_grants
AS RESTRICTIVE FOR ALL TO authenticated
USING (account_owner_id = public.get_user_account_owner_id(auth.uid()))
WITH CHECK (account_owner_id = public.get_user_account_owner_id(auth.uid()));

DROP POLICY IF EXISTS receptionist_grants_admin ON public.receptionist_professional_grants;
CREATE POLICY receptionist_grants_admin ON public.receptionist_professional_grants
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS receptionist_grants_own_select ON public.receptionist_professional_grants;
CREATE POLICY receptionist_grants_own_select ON public.receptionist_professional_grants
FOR SELECT TO authenticated
USING (receptionist_professional_id = public.my_professional_id());

-- ============ AUDIT ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financial_accounts','financial_movements','charges','charge_installments','commission_rules','commissions','receptionist_professional_grants'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_audit_trg ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function()', t, t);
  END LOOP;
END $$;