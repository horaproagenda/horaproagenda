
-- 1) list_all_accounts_admin: incluir TODOS os usuários do auth como owners potenciais
CREATE OR REPLACE FUNCTION public.list_all_accounts_admin()
 RETURNS TABLE(owner_user_id uuid, email text, status text, plan_tier integer, seat_limit integer, trial_ends_at timestamp with time zone, current_period_end timestamp with time zone, is_grandfathered boolean, stripe_customer_id text, stripe_subscription_id text, created_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  RETURN QUERY
  WITH owners AS (
    SELECT s.owner_user_id FROM public.account_subscriptions s
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = p.account_owner_id
    UNION
    SELECT tr.user_id FROM public.trial_registrations tr WHERE tr.user_id IS NOT NULL
    UNION
    SELECT pr.account_owner_id FROM public.professionals pr WHERE pr.account_owner_id IS NOT NULL
    UNION
    SELECT u.id FROM auth.users u WHERE u.email IS NOT NULL
  )
  SELECT DISTINCT
    o.owner_user_id,
    COALESCE(u.email::text, p.email, tr.email)::text AS email,
    COALESCE(s.status, tr.subscription_status,
             CASE WHEN COALESCE(p.is_active, true) THEN 'trial' ELSE 'canceled' END)::text AS status,
    s.plan_tier,
    COALESCE(s.seat_limit, 1) AS seat_limit,
    COALESCE(s.trial_ends_at, tr.trial_ended_at) AS trial_ends_at,
    s.current_period_end,
    COALESCE(s.is_grandfathered, false) AS is_grandfathered,
    s.stripe_customer_id,
    s.stripe_subscription_id,
    COALESCE(s.created_at, p.created_at, tr.created_at, u.created_at) AS created_at
  FROM owners o
  LEFT JOIN public.account_subscriptions s ON s.owner_user_id = o.owner_user_id
  LEFT JOIN auth.users u ON u.id = o.owner_user_id
  LEFT JOIN public.profiles p ON p.id = o.owner_user_id
  LEFT JOIN public.trial_registrations tr ON tr.user_id = o.owner_user_id
  ORDER BY COALESCE(s.created_at, p.created_at, tr.created_at, u.created_at) DESC NULLS LAST;
END;
$function$;

-- 2) list_account_seat_usage_admin: idem
CREATE OR REPLACE FUNCTION public.list_account_seat_usage_admin()
 RETURNS TABLE(owner_user_id uuid, email text, status text, is_grandfathered boolean, seat_limit integer, used integer, available integer, current_period_end timestamp with time zone, trial_ends_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH owners AS (
    SELECT s.owner_user_id FROM public.account_subscriptions s
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = p.account_owner_id
    UNION
    SELECT tr.user_id FROM public.trial_registrations tr WHERE tr.user_id IS NOT NULL
    UNION
    SELECT pr.account_owner_id FROM public.professionals pr WHERE pr.account_owner_id IS NOT NULL
    UNION
    SELECT u.id FROM auth.users u WHERE u.email IS NOT NULL
  ), unique_owners AS (
    SELECT DISTINCT owner_user_id FROM owners
  )
  SELECT
    o.owner_user_id,
    COALESCE(u.email::text, p.email, tr.email)::text AS email,
    COALESCE(s.status, tr.subscription_status,
             CASE WHEN COALESCE(p.is_active, true) THEN 'trial' ELSE 'canceled' END)::text AS status,
    COALESCE(s.is_grandfathered, false) AS is_grandfathered,
    COALESCE(s.seat_limit, 1) AS seat_limit,
    public.count_account_seats(o.owner_user_id) AS used,
    GREATEST(COALESCE(s.seat_limit, 1) - public.count_account_seats(o.owner_user_id), 0) AS available,
    s.current_period_end,
    COALESCE(s.trial_ends_at, tr.trial_ended_at) AS trial_ends_at
  FROM unique_owners o
  LEFT JOIN public.account_subscriptions s ON s.owner_user_id = o.owner_user_id
  LEFT JOIN auth.users u ON u.id = o.owner_user_id
  LEFT JOIN public.profiles p ON p.id = o.owner_user_id
  LEFT JOIN public.trial_registrations tr ON tr.user_id = o.owner_user_id
  ORDER BY COALESCE(u.email::text, p.email, tr.email) NULLS LAST;
END;
$function$;

-- 3) Auto-aprovar WhatsApp quando há credencial ativa
CREATE OR REPLACE FUNCTION public.tg_auto_approve_whatsapp_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = true AND NEW.instance_id IS NOT NULL AND NEW.token IS NOT NULL THEN
    UPDATE public.professionals
       SET whatsapp_release_approved = true
     WHERE id = NEW.professional_id
       AND COALESCE(whatsapp_release_approved, false) = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_approve_whatsapp_release_trg ON public.professional_whatsapp_credentials;
CREATE TRIGGER auto_approve_whatsapp_release_trg
AFTER INSERT OR UPDATE ON public.professional_whatsapp_credentials
FOR EACH ROW EXECUTE FUNCTION public.tg_auto_approve_whatsapp_release();

-- Backfill
UPDATE public.professionals p
   SET whatsapp_release_approved = true
  FROM public.professional_whatsapp_credentials c
 WHERE c.professional_id = p.id
   AND c.is_active = true
   AND c.instance_id IS NOT NULL
   AND c.token IS NOT NULL
   AND COALESCE(p.whatsapp_release_approved, false) = false;

-- 4) Realtime para interest_leads, account_subscriptions
ALTER TABLE public.interest_leads REPLICA IDENTITY FULL;
ALTER TABLE public.account_subscriptions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='interest_leads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.interest_leads';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='account_subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.account_subscriptions';
  END IF;
END $$;

-- 5) Recriar cron de lembretes WhatsApp com x-cron-secret
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE NOTICE 'CRON_SECRET missing from vault — leaving cron untouched';
    RETURN;
  END IF;

  PERFORM cron.unschedule('send-appointment-reminders-every-5min');

  PERFORM cron.schedule(
    'send-appointment-reminders-every-5min',
    '*/5 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/send-appointment-reminders',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
    $cmd$, v_secret)
  );
END $$;
