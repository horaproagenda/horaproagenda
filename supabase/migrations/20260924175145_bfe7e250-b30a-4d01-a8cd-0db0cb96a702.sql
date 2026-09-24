CREATE OR REPLACE FUNCTION public.confirm_verification_code(p_email text, p_code text, p_type text, p_token_hash text, p_request_id uuid, p_grant_expires_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  SELECT * INTO v_match FROM public.verification_codes
  WHERE email = v_email AND type = v_type AND code = v_code
    AND used_at IS NULL AND expires_at >= now()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    -- Redefinição de senha ('login'): o código só é conferido aqui.
    -- Ele é marcado como usado apenas depois que a senha for trocada
    -- (consume_verification_code, chamado pela função reset-password).
    IF v_type = 'signup' THEN
      UPDATE public.verification_codes SET used_at = now()
      WHERE id = v_match.id AND used_at IS NULL;

      INSERT INTO public.signup_verification_grants (email, token_hash, verification_code_id, request_id, expires_at)
      VALUES (v_email, p_token_hash, v_match.id, p_request_id, p_grant_expires_at)
      ON CONFLICT (request_id) DO UPDATE
      SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, updated_at = now();
    END IF;

    RETURN jsonb_build_object('valid', true, 'type', v_type,
      'expires_at', CASE WHEN v_type = 'signup' THEN p_grant_expires_at ELSE v_match.expires_at END);
  END IF;

  SELECT * INTO v_latest FROM public.verification_codes
  WHERE email = v_email AND type = v_type AND used_at IS NULL AND expires_at >= now()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.verification_codes WHERE email = v_email AND type = v_type AND expires_at < now()) THEN
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
    UPDATE public.verification_codes SET used_at = coalesce(used_at, now())
    WHERE email = v_email AND type = v_type AND used_at IS NULL;
    RETURN jsonb_build_object('valid', false, 'code', 'too_many_attempts', 'remaining', 0);
  END IF;

  RETURN jsonb_build_object('valid', false, 'code', 'wrong_code', 'remaining', 5 - v_attempts);
END;
$function$;

-- Marca o código como usado. Chamado só depois que a senha foi trocada.
CREATE OR REPLACE FUNCTION public.consume_verification_code(p_email text, p_code text, p_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.verification_codes
  SET used_at = now()
  WHERE email = lower(trim(coalesce(p_email, '')))
    AND type = lower(trim(coalesce(p_type, '')))
    AND code = regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g')
    AND used_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Os demais códigos pendentes do mesmo e-mail deixam de valer.
  UPDATE public.verification_codes SET used_at = now()
  WHERE email = lower(trim(coalesce(p_email, ''))) AND type = lower(trim(coalesce(p_type, ''))) AND used_at IS NULL;
  RETURN v_count > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_verification_code(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_verification_code(text, text, text) TO service_role;