CREATE OR REPLACE FUNCTION public.handle_new_account_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.account_owner_id IS NULL OR NEW.account_owner_id = NEW.id THEN
    INSERT INTO public.account_subscriptions (
      owner_user_id, status, trial_ends_at, seat_limit
    ) VALUES (
      NEW.id, 'trial', now() + interval '30 days', 1
    )
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.account_subscriptions (owner_user_id, status, trial_ends_at, seat_limit)
  VALUES (NEW.id, 'trial', now() + interval '30 days', 1)
  ON CONFLICT (owner_user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;