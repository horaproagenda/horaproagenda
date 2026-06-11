
-- 1) verificacoes_whatsapp: deny-all explicit policy (table is service-role only)
ALTER TABLE public.verificacoes_whatsapp ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all client access" ON public.verificacoes_whatsapp;
CREATE POLICY "Deny all client access"
  ON public.verificacoes_whatsapp
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON public.verificacoes_whatsapp FROM anon, authenticated;
GRANT ALL ON public.verificacoes_whatsapp TO service_role;

-- 2) professional_credentials: clear temp_password once user has changed it
CREATE OR REPLACE FUNCTION public.clear_temp_password_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.password_changed_at IS NOT NULL OR NEW.must_change_password = false THEN
    NEW.temp_password := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_temp_password ON public.professional_credentials;
CREATE TRIGGER trg_clear_temp_password
BEFORE INSERT OR UPDATE ON public.professional_credentials
FOR EACH ROW EXECUTE FUNCTION public.clear_temp_password_on_change();

-- Backfill: clear existing temp passwords for users who already changed
UPDATE public.professional_credentials
SET temp_password = NULL
WHERE temp_password IS NOT NULL
  AND (password_changed_at IS NOT NULL OR must_change_password = false);

-- 3) Remove sensitive tables from realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='account_subscriptions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.account_subscriptions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_permissions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_permissions';
  END IF;
END $$;
