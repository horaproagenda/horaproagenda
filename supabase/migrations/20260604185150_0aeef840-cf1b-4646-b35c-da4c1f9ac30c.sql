
-- ================================================================
-- Trial + Cobrança + Permissões granulares + Inativação
-- ================================================================

-- 1) Enum dos módulos do app
DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM (
    'agenda','clientes','financeiro','caixa','produtos','servicos',
    'cadastros','relatorios','documentos','lembretes','configuracoes',
    'auditoria','assinatura'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Colunas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS account_owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_account_owner ON public.profiles(account_owner_id);

-- 3) account_subscriptions: 1 por dono de conta (admin)
CREATE TABLE IF NOT EXISTS public.account_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial','active','past_due','canceled','grandfathered')),
  trial_ends_at timestamptz,
  plan_tier int,
  seat_limit int NOT NULL DEFAULT 1,
  is_grandfathered boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.account_subscriptions TO authenticated;
GRANT ALL ON public.account_subscriptions TO service_role;

ALTER TABLE public.account_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner pode ler sua assinatura"
  ON public.account_subscriptions FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.account_owner_id = account_subscriptions.owner_user_id
    )
  );

CREATE TRIGGER trg_account_subs_updated
  BEFORE UPDATE ON public.account_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) user_permissions: granular por módulo e ação
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module public.app_module NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module)
);

GRANT SELECT ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê suas próprias permissões"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_user_permissions_updated
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Helpers SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module public.app_module, _action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_can boolean := false;
BEGIN
  SELECT public.has_role(_user_id, 'admin') INTO v_is_admin;
  IF v_is_admin THEN RETURN true; END IF;

  SELECT CASE _action
    WHEN 'view' THEN can_view
    WHEN 'create' THEN can_create
    WHEN 'edit' THEN can_edit
    WHEN 'delete' THEN can_delete
    ELSE false
  END INTO v_can
  FROM public.user_permissions
  WHERE user_id = _user_id AND module = _module;

  RETURN COALESCE(v_can, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_account_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), true);
$$;

CREATE OR REPLACE FUNCTION public.get_account_owner(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(account_owner_id, _user_id) FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS public.account_subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.* FROM public.account_subscriptions s
  WHERE s.owner_user_id = public.get_account_owner(auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.count_account_seats(_owner uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.profiles
  WHERE is_active = true
    AND (id = _owner OR account_owner_id = _owner);
$$;

-- 6) Trigger no signup: cria assinatura em trial 30d + permissões totais para o owner
CREATE OR REPLACE FUNCTION public.handle_new_account_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Só cria assinatura se o profile ainda não tem account_owner_id (i.e., é dono novo)
  IF NEW.account_owner_id IS NULL THEN
    INSERT INTO public.account_subscriptions (owner_user_id, status, trial_ends_at, seat_limit)
    VALUES (NEW.id, 'trial', now() + interval '30 days', 1)
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_account_signup ON public.profiles;
CREATE TRIGGER trg_new_account_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_account_signup();

-- 7) Grandfather: marca usuários existentes como ilimitados, sem cobrança
INSERT INTO public.account_subscriptions (owner_user_id, status, is_grandfathered, seat_limit)
SELECT u.id, 'grandfathered', true, 999
FROM auth.users u
ON CONFLICT (owner_user_id) DO UPDATE
  SET status = 'grandfathered', is_grandfathered = true, seat_limit = 999, updated_at = now();

-- 8) Concede permissões totais ao admin existente (qualquer usuário com role admin)
INSERT INTO public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete)
SELECT ur.user_id, m.module, true, true, true, true
FROM public.user_roles ur
CROSS JOIN (
  SELECT unnest(enum_range(NULL::public.app_module)) AS module
) m
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module) DO NOTHING;

-- 9) Realtime para profiles e account_subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
