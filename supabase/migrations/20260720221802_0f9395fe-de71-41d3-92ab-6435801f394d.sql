
-- 1) handle_new_user: honra metadata is_seat_user / account_owner_id enviados pelo servidor
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_seat boolean := COALESCE((NEW.raw_user_meta_data->>'is_seat_user')::boolean, false);
  v_owner uuid := NULLIF(NEW.raw_user_meta_data->>'account_owner_id', '')::uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, account_owner_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    CASE WHEN v_is_seat AND v_owner IS NOT NULL THEN v_owner ELSE NEW.id END
  )
  ON CONFLICT (id) DO NOTHING;

  -- Só semeia formas de pagamento para donos de conta reais
  IF NOT v_is_seat THEN
    PERFORM public.seed_default_payment_methods(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) tg_ensure_default_admin_role: não dá admin para usuários de assento
CREATE OR REPLACE FUNCTION public.tg_ensure_default_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_seat boolean := COALESCE((NEW.raw_user_meta_data->>'is_seat_user')::boolean, false);
BEGIN
  IF v_is_seat THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3) Limpeza dos dados órfãos criados para Igor antes desta correção
-- (usuário 8e58fd74-db28-4313-bc9b-d1659f4d7080, dono correto = 47165cc3-15ac-4fbc-9c2e-aa407e665b56)

-- Remove profissional duplicado auto-criado (self)
DELETE FROM public.professionals
 WHERE id = '6dde8996-645c-4b7a-b750-d46cba6d30d8'
   AND account_owner_id = '8e58fd74-db28-4313-bc9b-d1659f4d7080';

-- Remove papel admin órfão do usuário de assento
DELETE FROM public.user_roles
 WHERE user_id = '8e58fd74-db28-4313-bc9b-d1659f4d7080'
   AND role = 'admin';

-- Corrige o papel professional para apontar para a conta da Maria
UPDATE public.user_roles
   SET account_owner_id = '47165cc3-15ac-4fbc-9c2e-aa407e665b56'
 WHERE user_id = '8e58fd74-db28-4313-bc9b-d1659f4d7080'
   AND role = 'professional';

-- Remove a assinatura trial fantasma
DELETE FROM public.account_subscriptions
 WHERE owner_user_id = '8e58fd74-db28-4313-bc9b-d1659f4d7080';

-- Vincula o profile do Igor à conta da Maria
UPDATE public.profiles
   SET account_owner_id = '47165cc3-15ac-4fbc-9c2e-aa407e665b56'
 WHERE id = '8e58fd74-db28-4313-bc9b-d1659f4d7080';
