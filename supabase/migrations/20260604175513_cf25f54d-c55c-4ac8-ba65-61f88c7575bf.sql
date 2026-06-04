
CREATE TABLE IF NOT EXISTS public.deleted_account_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text,
  cpf_hash text,
  cnpj_hash text,
  phone_hash text,
  had_paid boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz NOT NULL DEFAULT (now() + interval '6 months'),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dab_email ON public.deleted_account_blocklist (email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dab_cpf ON public.deleted_account_blocklist (cpf_hash) WHERE cpf_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dab_cnpj ON public.deleted_account_blocklist (cnpj_hash) WHERE cnpj_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dab_phone ON public.deleted_account_blocklist (phone_hash) WHERE phone_hash IS NOT NULL;

GRANT SELECT ON public.deleted_account_blocklist TO authenticated;
GRANT ALL ON public.deleted_account_blocklist TO service_role;

ALTER TABLE public.deleted_account_blocklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read blocklist" ON public.deleted_account_blocklist;
CREATE POLICY "Admins read blocklist"
  ON public.deleted_account_blocklist FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.hash_identifier(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN _value IS NULL OR length(trim(_value)) = 0 THEN NULL
    ELSE encode(extensions.digest(lower(trim(_value)), 'sha256'), 'hex')
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_identifier_blocked(
  p_email text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_cnpj text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email_h text := public.hash_identifier(p_email);
  v_cpf_h text := public.hash_identifier(regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g'));
  v_cnpj_h text := public.hash_identifier(regexp_replace(COALESCE(p_cnpj, ''), '\D', '', 'g'));
  v_phone_h text := public.hash_identifier(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'));
  v_row public.deleted_account_blocklist%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.deleted_account_blocklist
  WHERE blocked_until > now()
    AND (
      (v_email_h IS NOT NULL AND email_hash = v_email_h)
      OR (v_cpf_h IS NOT NULL AND cpf_hash = v_cpf_h)
      OR (v_cnpj_h IS NOT NULL AND cnpj_hash = v_cnpj_h)
      OR (v_phone_h IS NOT NULL AND phone_hash = v_phone_h)
    )
  ORDER BY blocked_until DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  RETURN jsonb_build_object(
    'blocked', true,
    'blocked_until', v_row.blocked_until,
    'deleted_at', v_row.deleted_at,
    'had_paid', v_row.had_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_identifier_blocked(text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_trial_eligibility(p_email text, p_phone text DEFAULT NULL::text, p_cnpj text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_block jsonb;
BEGIN
  v_block := public.is_identifier_blocked(p_email, NULL, p_cnpj, p_phone);
  IF (v_block->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'account_recently_deleted',
      'message', 'Os dados informados pertencem a um cadastro excluído recentemente. Não é possível usar o período gratuito novamente nos próximos 6 meses. Para reativar, contrate um plano pago.',
      'blocked_until', v_block->>'blocked_until',
      'requires_payment', true
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
