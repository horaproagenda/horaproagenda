
-- ============================================================
-- MIGRATION 1/3: Multi-tenant isolation — structural + backfill
-- Adds account_owner_id to critical tables, backfills from
-- existing relationships, and installs auto-fill triggers.
-- No RLS changes yet (next migration).
-- ============================================================

-- Step 0: Ensure every profile has an account_owner_id
-- For existing users without one, they ARE the owner (single-user tenant).
UPDATE public.profiles
SET account_owner_id = id
WHERE account_owner_id IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN account_owner_id SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN account_owner_id SET DEFAULT NULL;

-- Step 1: helper to resolve account_owner_id from a user id
CREATE OR REPLACE FUNCTION public.get_account_owner_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT account_owner_id FROM public.profiles WHERE id = _user_id),
    _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.get_account_owner_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_owner_for_user(uuid) TO authenticated, service_role;

-- Step 2: helper to resolve the CURRENT user's account_owner_id
CREATE OR REPLACE FUNCTION public.current_account_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_account_owner_for_user(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.current_account_owner_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_account_owner_id() TO authenticated, service_role;

-- Step 3: Add account_owner_id to all critical tables (nullable first)
ALTER TABLE public.business_settings                ADD COLUMN IF NOT EXISTS account_owner_id uuid;
ALTER TABLE public.user_roles                       ADD COLUMN IF NOT EXISTS account_owner_id uuid;
ALTER TABLE public.professional_whatsapp_credentials ADD COLUMN IF NOT EXISTS account_owner_id uuid;
ALTER TABLE public.professional_credentials         ADD COLUMN IF NOT EXISTS account_owner_id uuid;
ALTER TABLE public.appointments                     ADD COLUMN IF NOT EXISTS account_owner_id uuid;
ALTER TABLE public.professionals                    ADD COLUMN IF NOT EXISTS account_owner_id uuid;

-- Step 4: Backfill
-- Pick a default owner: the first admin (deterministic). This is only used
-- as a safety net if no relationship resolves; real data is mapped by joins.
DO $$
DECLARE
  v_default_owner uuid;
BEGIN
  SELECT ur.user_id
  INTO v_default_owner
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ORDER BY ur.user_id
  LIMIT 1;

  -- professionals: from user_id → profiles.account_owner_id
  UPDATE public.professionals pr
  SET account_owner_id = COALESCE(
    public.get_account_owner_for_user(pr.user_id),
    v_default_owner
  )
  WHERE account_owner_id IS NULL;

  -- appointments: via professionals
  UPDATE public.appointments a
  SET account_owner_id = COALESCE(p.account_owner_id, v_default_owner)
  FROM public.professionals p
  WHERE a.professional_id = p.id
    AND a.account_owner_id IS NULL;

  -- remaining appointments without a pro
  UPDATE public.appointments
  SET account_owner_id = v_default_owner
  WHERE account_owner_id IS NULL;

  -- professional_credentials: via user_id
  UPDATE public.professional_credentials pc
  SET account_owner_id = COALESCE(
    public.get_account_owner_for_user(pc.user_id),
    v_default_owner
  )
  WHERE account_owner_id IS NULL;

  -- professional_whatsapp_credentials: via professionals.professional_id
  UPDATE public.professional_whatsapp_credentials wc
  SET account_owner_id = COALESCE(p.account_owner_id, v_default_owner)
  FROM public.professionals p
  WHERE wc.professional_id = p.id
    AND wc.account_owner_id IS NULL;

  UPDATE public.professional_whatsapp_credentials
  SET account_owner_id = v_default_owner
  WHERE account_owner_id IS NULL;

  -- user_roles: via user_id → profiles.account_owner_id
  UPDATE public.user_roles ur
  SET account_owner_id = COALESCE(
    public.get_account_owner_for_user(ur.user_id),
    v_default_owner
  )
  WHERE account_owner_id IS NULL;

  -- business_settings: legacy single row → default owner
  UPDATE public.business_settings
  SET account_owner_id = v_default_owner
  WHERE account_owner_id IS NULL;
END $$;

-- Step 5: Verify backfill — abort if anything is still NULL
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'professionals' t, count(*) c FROM public.professionals WHERE account_owner_id IS NULL
    UNION ALL SELECT 'appointments', count(*) FROM public.appointments WHERE account_owner_id IS NULL
    UNION ALL SELECT 'professional_credentials', count(*) FROM public.professional_credentials WHERE account_owner_id IS NULL
    UNION ALL SELECT 'professional_whatsapp_credentials', count(*) FROM public.professional_whatsapp_credentials WHERE account_owner_id IS NULL
    UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles WHERE account_owner_id IS NULL
    UNION ALL SELECT 'business_settings', count(*) FROM public.business_settings WHERE account_owner_id IS NULL
  LOOP
    IF r.c > 0 THEN
      RAISE EXCEPTION 'Backfill incomplete: % rows still NULL in %', r.c, r.t;
    END IF;
  END LOOP;
END $$;

-- Step 6: Auto-fill trigger on INSERT (defensive — code may forget the column)
CREATE OR REPLACE FUNCTION public.tg_autofill_account_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.account_owner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) prefer the caller's tenant
  v_owner := public.get_account_owner_for_user(auth.uid());

  -- 2) fall back to a related user_id column on the row, if any
  IF v_owner IS NULL THEN
    BEGIN
      v_owner := public.get_account_owner_for_user((row_to_json(NEW)->>'user_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_owner := NULL;
    END;
  END IF;

  NEW.account_owner_id := v_owner;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autofill_owner_business_settings                ON public.business_settings;
DROP TRIGGER IF EXISTS trg_autofill_owner_user_roles                       ON public.user_roles;
DROP TRIGGER IF EXISTS trg_autofill_owner_professional_whatsapp_credentials ON public.professional_whatsapp_credentials;
DROP TRIGGER IF EXISTS trg_autofill_owner_professional_credentials         ON public.professional_credentials;
DROP TRIGGER IF EXISTS trg_autofill_owner_appointments                     ON public.appointments;
DROP TRIGGER IF EXISTS trg_autofill_owner_professionals                    ON public.professionals;

CREATE TRIGGER trg_autofill_owner_business_settings
  BEFORE INSERT ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

CREATE TRIGGER trg_autofill_owner_user_roles
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

CREATE TRIGGER trg_autofill_owner_professional_whatsapp_credentials
  BEFORE INSERT ON public.professional_whatsapp_credentials
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

CREATE TRIGGER trg_autofill_owner_professional_credentials
  BEFORE INSERT ON public.professional_credentials
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

CREATE TRIGGER trg_autofill_owner_appointments
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

CREATE TRIGGER trg_autofill_owner_professionals
  BEFORE INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

-- Step 7: Indexes (RLS will use these heavily in Migration 2)
CREATE INDEX IF NOT EXISTS idx_business_settings_owner                 ON public.business_settings(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_owner                        ON public.user_roles(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_prof_wa_creds_owner                     ON public.professional_whatsapp_credentials(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_prof_creds_owner                        ON public.professional_credentials(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_appointments_owner                      ON public.appointments(account_owner_id);
CREATE INDEX IF NOT EXISTS idx_professionals_owner                     ON public.professionals(account_owner_id);
