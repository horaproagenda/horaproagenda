
-- Remover período de teste gratuito: nova assinatura já nasce vencida, forçando pagamento
CREATE OR REPLACE FUNCTION public.handle_new_account_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Cria assinatura para todo novo dono de conta (account_owner_id = próprio id do profile)
  IF NEW.account_owner_id IS NULL OR NEW.account_owner_id = NEW.id THEN
    INSERT INTO public.account_subscriptions (
      owner_user_id, status, trial_ends_at, seat_limit
    ) VALUES (
      NEW.id, 'trial', now() - interval '1 second', 1
    )
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: qualquer dono de conta sem linha em account_subscriptions recebe
-- assinatura com trial já vencido (obrigando o pagamento). Não afeta grandfathered.
INSERT INTO public.account_subscriptions (owner_user_id, status, trial_ends_at, seat_limit)
SELECT p.id, 'trial', now() - interval '1 second', 1
FROM public.profiles p
LEFT JOIN public.account_subscriptions s ON s.owner_user_id = p.id
WHERE p.account_owner_id = p.id
  AND s.owner_user_id IS NULL
ON CONFLICT (owner_user_id) DO NOTHING;
