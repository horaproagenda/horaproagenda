
-- 1) Add super_admin to enum (must commit before being usable in same tx — split via DO block trick not needed; use ALTER + safe insert)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) Helper: is_super_admin (uses has_role under the hood; tolerant of fresh enum value via text cast)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'super_admin'
  );
$$;

-- 3) Listar todas as contas (apenas super_admin)
CREATE OR REPLACE FUNCTION public.list_all_accounts_admin()
RETURNS TABLE (
  owner_user_id uuid,
  email text,
  status text,
  plan_tier integer,
  seat_limit integer,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  is_grandfathered boolean,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  RETURN QUERY
  SELECT
    s.owner_user_id,
    u.email::text,
    s.status,
    s.plan_tier,
    s.seat_limit,
    s.trial_ends_at,
    s.current_period_end,
    s.is_grandfathered,
    s.stripe_customer_id,
    s.stripe_subscription_id,
    s.created_at
  FROM public.account_subscriptions s
  LEFT JOIN auth.users u ON u.id = s.owner_user_id
  ORDER BY s.created_at DESC;
END;
$$;
