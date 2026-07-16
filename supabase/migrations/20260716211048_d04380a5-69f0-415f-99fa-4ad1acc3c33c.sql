-- 1) Novos cadastros começam SEM trial (bloqueados até pagamento)
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' OR NEW.role = 'authenticated' THEN NULL; END IF;
  INSERT INTO public.account_subscriptions (owner_user_id, status, trial_ends_at, seat_limit)
  VALUES (NEW.id, 'trial', now() - interval '1 second', 1)
  ON CONFLICT (owner_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2) Notificações anonimizadas de novos cadastros (sem PII)
CREATE TABLE IF NOT EXISTS public.signup_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  email_sent boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.signup_notifications TO authenticated;
GRANT ALL ON public.signup_notifications TO service_role;

ALTER TABLE public.signup_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view signup notifications"
ON public.signup_notifications FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Service role manages signup notifications"
ON public.signup_notifications FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- 3) Trigger: registra novo cadastro (sem PII) e dispara e-mail via pg_net
CREATE OR REPLACE FUNCTION public.notify_new_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/send-transactional-email';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE';
  v_total int;
BEGIN
  INSERT INTO public.signup_notifications (created_at) VALUES (now());
  SELECT count(*) INTO v_total FROM public.account_subscriptions;
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon,'apikey',v_anon),
      body := jsonb_build_object(
        'templateName','new-signup-notification',
        'idempotencyKey','signup-'||NEW.id::text,
        'templateData', jsonb_build_object('signupTime', to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'totalAccounts', v_total)
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_signup ON public.account_subscriptions;
CREATE TRIGGER trg_notify_new_signup
AFTER INSERT ON public.account_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.notify_new_signup();