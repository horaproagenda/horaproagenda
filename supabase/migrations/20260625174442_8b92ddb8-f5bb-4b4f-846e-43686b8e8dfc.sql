-- 1) Harden profile/user-role visibility: admins must only see their own clinic/account.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "tenant_select_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR id = auth.uid()
  OR (
    account_owner_id = public.current_account_owner_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "tenant_update_profiles_self"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid() AND account_owner_id = public.current_account_owner_id())
WITH CHECK (id = auth.uid() AND account_owner_id = public.current_account_owner_id());

CREATE POLICY "tenant_update_profiles_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id = public.current_account_owner_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins read blocklist" ON public.deleted_account_blocklist;
CREATE POLICY "Super admins read blocklist"
  ON public.deleted_account_blocklist FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 2) Add safe audit fields for platform-level cancellations/blocking.
ALTER TABLE public.deleted_account_blocklist
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS full_name_hash text,
  ADD COLUMN IF NOT EXISTS email_masked text,
  ADD COLUMN IF NOT EXISTS phone_masked text,
  ADD COLUMN IF NOT EXISTS cpf_last4 text,
  ADD COLUMN IF NOT EXISTS cnpj_last4 text,
  ADD COLUMN IF NOT EXISTS canceled_by uuid,
  ADD COLUMN IF NOT EXISTS cancellation_type text NOT NULL DEFAULT 'self_deletion';

CREATE INDEX IF NOT EXISTS idx_dab_user_id ON public.deleted_account_blocklist (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dab_full_name ON public.deleted_account_blocklist (full_name_hash) WHERE full_name_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dab_active_until ON public.deleted_account_blocklist (blocked_until);

-- 3) Allow eligibility checks to include CPF and keep the previous signature working.
CREATE OR REPLACE FUNCTION public.check_trial_eligibility(
  p_email text,
  p_phone text DEFAULT NULL::text,
  p_cnpj text DEFAULT NULL::text,
  p_cpf text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_block jsonb;
BEGIN
  v_block := public.is_identifier_blocked(p_email, p_cpf, p_cnpj, p_phone);
  IF (v_block->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'account_blocked',
      'message', 'Este cadastro foi cancelado/bloqueado pela administração da plataforma. Entre em contato com o suporte para reativação.',
      'blocked_until', v_block->>'blocked_until',
      'requires_support', true
    );
  END IF;

  SELECT * INTO v_existing FROM public.trial_registrations WHERE email = LOWER(p_email);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'email_exists',
      'message', 'Este e-mail já possui cadastro. Use a opção "Esqueci minha senha" para recuperar o acesso.',
      'trial_started_at', v_existing.trial_started_at,
      'has_paid', v_existing.has_paid
    );
  END IF;

  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT * INTO v_existing FROM public.trial_registrations WHERE phone = p_phone;
    IF FOUND THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'phone_exists',
        'message', 'Este número de telefone já foi usado em outro cadastro.', 'email', v_existing.email);
    END IF;
  END IF;

  IF p_cpf IS NOT NULL AND p_cpf <> '' THEN
    SELECT * INTO v_existing FROM public.trial_registrations WHERE cpf = regexp_replace(p_cpf, '\D', '', 'g');
    IF FOUND THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'cpf_exists',
        'message', 'Este CPF já possui cadastro.', 'email', v_existing.email);
    END IF;
  END IF;

  IF p_cnpj IS NOT NULL AND p_cnpj <> '' THEN
    SELECT * INTO v_existing FROM public.trial_registrations WHERE cnpj = p_cnpj;
    IF FOUND THEN
      RETURN jsonb_build_object('eligible', false, 'reason', 'cnpj_exists',
        'message', 'Este CNPJ já foi usado em outro cadastro.', 'email', v_existing.email);
    END IF;
  END IF;

  RETURN jsonb_build_object('eligible', true, 'message', 'Usuário elegível para período de teste');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_trial_eligibility(text, text, text, text) TO anon, authenticated;

-- 4) Super Admin account lists must include every signup, even if subscription provisioning failed.
CREATE OR REPLACE FUNCTION public.list_all_accounts_admin()
 RETURNS TABLE(owner_user_id uuid, email text, status text, plan_tier integer, seat_limit integer, trial_ends_at timestamp with time zone, current_period_end timestamp with time zone, is_grandfathered boolean, stripe_customer_id text, stripe_subscription_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  RETURN QUERY
  WITH owners AS (
    SELECT s.owner_user_id FROM public.account_subscriptions s
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = p.account_owner_id
    UNION
    SELECT tr.user_id FROM public.trial_registrations tr WHERE tr.user_id IS NOT NULL
  )
  SELECT
    o.owner_user_id,
    COALESCE(u.email::text, p.email, tr.email)::text AS email,
    COALESCE(s.status, tr.subscription_status, CASE WHEN COALESCE(p.is_active, true) THEN 'trial' ELSE 'canceled' END)::text AS status,
    s.plan_tier,
    COALESCE(s.seat_limit, 1) AS seat_limit,
    COALESCE(s.trial_ends_at, tr.trial_ended_at) AS trial_ends_at,
    s.current_period_end,
    COALESCE(s.is_grandfathered, false) AS is_grandfathered,
    s.stripe_customer_id,
    s.stripe_subscription_id,
    COALESCE(s.created_at, p.created_at, tr.created_at, u.created_at) AS created_at
  FROM owners o
  LEFT JOIN public.account_subscriptions s ON s.owner_user_id = o.owner_user_id
  LEFT JOIN auth.users u ON u.id = o.owner_user_id
  LEFT JOIN public.profiles p ON p.id = o.owner_user_id
  LEFT JOIN public.trial_registrations tr ON tr.user_id = o.owner_user_id
  ORDER BY COALESCE(s.created_at, p.created_at, tr.created_at, u.created_at) DESC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_account_seat_usage_admin()
 RETURNS TABLE(owner_user_id uuid, email text, status text, is_grandfathered boolean, seat_limit integer, used integer, available integer, current_period_end timestamp with time zone, trial_ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH owners AS (
    SELECT s.owner_user_id FROM public.account_subscriptions s
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = p.account_owner_id
    UNION
    SELECT tr.user_id FROM public.trial_registrations tr WHERE tr.user_id IS NOT NULL
  )
  SELECT
    o.owner_user_id,
    COALESCE(u.email::text, p.email, tr.email)::text AS email,
    COALESCE(s.status, tr.subscription_status, CASE WHEN COALESCE(p.is_active, true) THEN 'trial' ELSE 'canceled' END)::text AS status,
    COALESCE(s.is_grandfathered, false) AS is_grandfathered,
    COALESCE(s.seat_limit, 1) AS seat_limit,
    public.count_account_seats(o.owner_user_id) AS used,
    GREATEST(COALESCE(s.seat_limit, 1) - public.count_account_seats(o.owner_user_id), 0) AS available,
    s.current_period_end,
    COALESCE(s.trial_ends_at, tr.trial_ended_at) AS trial_ends_at
  FROM owners o
  LEFT JOIN public.account_subscriptions s ON s.owner_user_id = o.owner_user_id
  LEFT JOIN auth.users u ON u.id = o.owner_user_id
  LEFT JOIN public.profiles p ON p.id = o.owner_user_id
  LEFT JOIN public.trial_registrations tr ON tr.user_id = o.owner_user_id
  ORDER BY COALESCE(u.email::text, p.email, tr.email) NULLS LAST;
END;
$function$;