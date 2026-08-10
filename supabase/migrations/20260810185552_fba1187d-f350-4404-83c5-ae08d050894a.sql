CREATE OR REPLACE FUNCTION public.must_change_password_for_current_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT must_change_password FROM public.professional_credentials WHERE user_id = auth.uid() LIMIT 1),
    false
  ) OR COALESCE(
    (SELECT must_change_password FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para continuar.';
  END IF;

  UPDATE public.professional_credentials
  SET must_change_password = false,
      temp_password = NULL,
      password_changed_at = now(),
      updated_at = now()
  WHERE user_id = auth.uid();

  UPDATE public.profiles
  SET must_change_password = false
  WHERE id = auth.uid()
    AND must_change_password = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.must_change_password_for_current_user() TO authenticated;