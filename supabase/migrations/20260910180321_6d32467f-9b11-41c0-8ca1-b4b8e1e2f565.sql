ALTER FUNCTION public.confirm_verification_code(text, text, text, text, uuid, timestamptz) SECURITY INVOKER;
ALTER FUNCTION public.consume_signup_verification_grant(text, text) SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.issue_verification_code(
  p_email text,
  p_type text,
  p_code text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_type text := lower(trim(coalesce(p_type, '')));
  v_code text := regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  v_id uuid;
  v_recent timestamptz;
BEGIN
  IF v_email = '' OR v_type NOT IN ('signup', 'login') OR length(v_code) <> 6 THEN
    RETURN jsonb_build_object('created', false, 'code', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_email || ':' || v_type, 0));

  SELECT created_at INTO v_recent
  FROM public.verification_codes
  WHERE email = v_email AND type = v_type
    AND created_at >= now() - interval '60 seconds'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'created', false,
      'code', 'cooldown',
      'retry_after', greatest(1, ceil(extract(epoch FROM (v_recent + interval '60 seconds' - now())))::integer)
    );
  END IF;

  DELETE FROM public.verification_codes
  WHERE email = v_email AND type = v_type AND expires_at < now();

  INSERT INTO public.verification_codes (email, code, type, expires_at)
  VALUES (v_email, v_code, v_type, p_expires_at)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('created', true, 'id', v_id, 'expires_at', p_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_verification_code(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_verification_code(text, text, text, timestamptz) TO service_role;