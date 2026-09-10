CREATE TABLE public.signup_verification_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  verification_code_id uuid,
  request_id uuid NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.signup_verification_grants TO service_role;

ALTER TABLE public.signup_verification_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages signup grants"
ON public.signup_verification_grants
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX signup_verification_grants_email_active_idx
ON public.signup_verification_grants (email, expires_at DESC)
WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_signup_verification_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_signup_verification_grant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_signup_verification_grant() TO service_role;

CREATE TRIGGER touch_signup_verification_grants_updated_at
BEFORE UPDATE ON public.signup_verification_grants
FOR EACH ROW
EXECUTE FUNCTION public.touch_signup_verification_grant();

CREATE OR REPLACE FUNCTION public.confirm_verification_code(
  p_email text,
  p_code text,
  p_type text,
  p_token_hash text,
  p_request_id uuid,
  p_grant_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  v_type text := lower(trim(coalesce(p_type, '')));
  v_match public.verification_codes%ROWTYPE;
  v_latest public.verification_codes%ROWTYPE;
  v_attempts integer;
BEGIN
  IF v_email = '' OR length(v_code) <> 6 OR v_type NOT IN ('signup', 'login') THEN
    RETURN jsonb_build_object('valid', false, 'code', 'invalid_input');
  END IF;

  SELECT * INTO v_match
  FROM public.verification_codes
  WHERE email = v_email
    AND type = v_type
    AND code = v_code
    AND used_at IS NULL
    AND expires_at >= now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.verification_codes
    SET used_at = now()
    WHERE id = v_match.id AND used_at IS NULL;

    IF v_type = 'signup' THEN
      INSERT INTO public.signup_verification_grants (
        email, token_hash, verification_code_id, request_id, expires_at
      ) VALUES (
        v_email, p_token_hash, v_match.id, p_request_id, p_grant_expires_at
      )
      ON CONFLICT (request_id) DO UPDATE
      SET token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          updated_at = now();
    END IF;

    RETURN jsonb_build_object(
      'valid', true,
      'type', v_type,
      'expires_at', CASE WHEN v_type = 'signup' THEN p_grant_expires_at ELSE v_match.expires_at END
    );
  END IF;

  SELECT * INTO v_latest
  FROM public.verification_codes
  WHERE email = v_email
    AND type = v_type
    AND used_at IS NULL
    AND expires_at >= now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.verification_codes
      WHERE email = v_email AND type = v_type AND expires_at < now()
    ) THEN
      RETURN jsonb_build_object('valid', false, 'code', 'code_expired');
    END IF;
    RETURN jsonb_build_object('valid', false, 'code', 'no_active_code');
  END IF;

  v_attempts := coalesce(v_latest.attempts, 0) + 1;
  UPDATE public.verification_codes
  SET attempts = v_attempts,
      used_at = CASE WHEN v_attempts >= 5 THEN now() ELSE used_at END
  WHERE id = v_latest.id;

  IF v_attempts >= 5 THEN
    UPDATE public.verification_codes
    SET used_at = coalesce(used_at, now())
    WHERE email = v_email AND type = v_type AND used_at IS NULL;
    RETURN jsonb_build_object('valid', false, 'code', 'too_many_attempts', 'remaining', 0);
  END IF;

  RETURN jsonb_build_object(
    'valid', false,
    'code', 'wrong_code',
    'remaining', 5 - v_attempts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_verification_code(text, text, text, text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_verification_code(text, text, text, text, uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_signup_verification_grant(
  p_email text,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant public.signup_verification_grants%ROWTYPE;
BEGIN
  SELECT * INTO v_grant
  FROM public.signup_verification_grants
  WHERE email = lower(trim(coalesce(p_email, '')))
    AND token_hash = p_token_hash
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'code', 'grant_invalid');
  END IF;
  IF v_grant.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'code', 'grant_expired');
  END IF;
  IF v_grant.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', true, 'already_consumed', true);
  END IF;

  UPDATE public.signup_verification_grants
  SET consumed_at = now(), updated_at = now()
  WHERE id = v_grant.id;

  RETURN jsonb_build_object('valid', true, 'already_consumed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_signup_verification_grant(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_signup_verification_grant(text, text) TO service_role;