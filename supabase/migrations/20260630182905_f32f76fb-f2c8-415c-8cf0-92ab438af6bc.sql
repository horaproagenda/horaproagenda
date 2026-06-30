
-- 1) Função: cria profissional admin a partir do profile/business_settings
CREATE OR REPLACE FUNCTION public.ensure_admin_professional(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_bs RECORD;
  v_exists boolean;
BEGIN
  -- Só age para "owners" (admins de conta — account_owner_id é nulo ou self)
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_profile.account_owner_id IS NOT NULL AND v_profile.account_owner_id <> p_user_id THEN
    RETURN; -- usuário filho da conta, não é admin
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.professionals
     WHERE account_owner_id = p_user_id AND user_id = p_user_id
  ) INTO v_exists;
  IF v_exists THEN RETURN; END IF;

  SELECT * INTO v_bs FROM public.business_settings
    WHERE account_owner_id = p_user_id
    LIMIT 1;

  INSERT INTO public.professionals (
    name, email, phone, is_active,
    user_id, account_owner_id,
    cep, street, number, complement, neighborhood, city, state
  ) VALUES (
    COALESCE(NULLIF(TRIM(v_profile.full_name), ''), split_part(v_profile.email,'@',1)),
    v_profile.email,
    COALESCE(v_profile.phone, v_bs.clinic_phone),
    true,
    p_user_id,
    p_user_id,
    v_bs.clinic_cep, v_bs.clinic_street, v_bs.clinic_number,
    v_bs.clinic_complement, v_bs.clinic_neighborhood,
    v_bs.clinic_city, v_bs.clinic_state
  );
END;
$$;

-- 2) Trigger: ao virar admin em user_roles, garante profissional
CREATE OR REPLACE FUNCTION public.tg_user_roles_ensure_admin_prof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    PERFORM public.ensure_admin_professional(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_ensure_admin_prof ON public.user_roles;
CREATE TRIGGER user_roles_ensure_admin_prof
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_user_roles_ensure_admin_prof();

-- 3) Backfill: para todas as contas admin sem profissional admin
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
     WHERE (p.account_owner_id IS NULL OR p.account_owner_id = p.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.professionals pr
          WHERE pr.account_owner_id = p.id AND pr.user_id = p.id
       )
  LOOP
    PERFORM public.ensure_admin_professional(r.id);
  END LOOP;
END $$;
