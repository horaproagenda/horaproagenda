ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS clinic_logo_url text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL';

CREATE OR REPLACE FUNCTION public.ensure_primary_admin_setup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile RECORD;
  v_settings_id uuid;
  v_professional_id uuid;
  v_is_owner boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- Somente o criador da conta (owner) pode ser o Administrador principal.
  v_is_owner := (v_profile.account_owner_id IS NULL OR v_profile.account_owner_id = v_user_id);

  IF v_is_owner THEN
    -- Vínculo de Administrador principal (sem duplicar usuário)
    INSERT INTO public.user_roles (user_id, role, account_owner_id)
    VALUES (v_user_id, 'admin', v_user_id)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Registro de profissional herdando nome/e-mail da conta autenticada
    PERFORM public.ensure_admin_professional(v_user_id);

    -- Garante registro de configurações da clínica
    SELECT id INTO v_settings_id FROM public.business_settings
      WHERE account_owner_id = v_user_id LIMIT 1;
    IF v_settings_id IS NULL THEN
      INSERT INTO public.business_settings (account_owner_id)
      VALUES (v_user_id)
      RETURNING id INTO v_settings_id;
    END IF;
  ELSE
    SELECT id INTO v_settings_id FROM public.business_settings
      WHERE account_owner_id = v_profile.account_owner_id LIMIT 1;
  END IF;

  SELECT id INTO v_professional_id FROM public.professionals
    WHERE user_id = v_user_id LIMIT 1;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'is_primary_admin', v_is_owner,
    'full_name', v_profile.full_name,
    'email', v_profile.email,
    'account_created_at', v_profile.created_at,
    'settings_id', v_settings_id,
    'professional_id', v_professional_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_primary_admin_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_primary_admin_setup() TO authenticated;