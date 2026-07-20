
-- 1) Ensure ultramsg_instance_pool is published for realtime so the
--    "Instâncias cadastradas" panel updates instantly when an instance
--    is freed (e.g., when a user account is deleted).
ALTER TABLE public.ultramsg_instance_pool REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ultramsg_instance_pool'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ultramsg_instance_pool;
  END IF;
END $$;

-- 2) When a professional row is deleted (which happens on user/account
--    purge), automatically release any UltraMsg pool instance previously
--    assigned to that professional. This makes the instance immediately
--    reusable by another user.
CREATE OR REPLACE FUNCTION public.release_ultramsg_pool_on_professional_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.ultramsg_instance_pool
     SET status = 'free',
         assigned_professional_id = NULL,
         assigned_at = NULL,
         activated_at = NULL
   WHERE assigned_professional_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_ultramsg_pool_on_professional_delete
  ON public.professionals;
CREATE TRIGGER trg_release_ultramsg_pool_on_professional_delete
  AFTER DELETE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.release_ultramsg_pool_on_professional_delete();

-- 3) Same safety net when only the WhatsApp credentials are deleted
--    (e.g., super-admin revoke flow without deleting the professional).
CREATE OR REPLACE FUNCTION public.release_ultramsg_pool_on_credentials_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.ultramsg_instance_pool
     SET status = 'free',
         assigned_professional_id = NULL,
         assigned_at = NULL,
         activated_at = NULL
   WHERE assigned_professional_id = OLD.professional_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_ultramsg_pool_on_credentials_delete
  ON public.professional_whatsapp_credentials;
CREATE TRIGGER trg_release_ultramsg_pool_on_credentials_delete
  AFTER DELETE ON public.professional_whatsapp_credentials
  FOR EACH ROW EXECUTE FUNCTION public.release_ultramsg_pool_on_credentials_delete();
