-- 1) Remove sensitive credential tables from the Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'professional_whatsapp_credentials'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.professional_whatsapp_credentials';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ultramsg_instance_pool'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.ultramsg_instance_pool';
  END IF;
END $$;

-- 2) Strict server-side validation/sanitization for anonymous lead intake
CREATE OR REPLACE FUNCTION public.validate_interest_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
  v_phone text;
BEGIN
  v_name := btrim(coalesce(NEW.name, ''));
  v_email := lower(btrim(coalesce(NEW.email, '')));
  v_phone := regexp_replace(coalesce(NEW.whatsapp, ''), '[^0-9]', '', 'g');

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Informe um nome válido (entre 2 e 120 caracteres).';
  END IF;

  IF v_name ~ '(?i)(<[a-z/!]|https?://|javascript:|\{\{)' THEN
    RAISE EXCEPTION 'O nome não pode conter links ou código.';
  END IF;

  IF v_email = '' OR length(v_email) > 254
     OR v_email !~ '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido.';
  END IF;

  IF v_phone <> '' AND (length(v_phone) < 10 OR length(v_phone) > 15) THEN
    RAISE EXCEPTION 'Informe um WhatsApp válido com DDD.';
  END IF;

  NEW.name := v_name;
  NEW.email := v_email;
  NEW.whatsapp := NULLIF(v_phone, '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_validate_interest_lead ON public.interest_leads;
CREATE TRIGGER tg_validate_interest_lead
BEFORE INSERT OR UPDATE ON public.interest_leads
FOR EACH ROW EXECUTE FUNCTION public.validate_interest_lead();