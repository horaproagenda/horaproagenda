
-- Add account_owner_id to professional_preferences for stronger tenant isolation
ALTER TABLE public.professional_preferences
  ADD COLUMN IF NOT EXISTS account_owner_id uuid;

-- Backfill from profiles.account_owner_id (fallback to user_id)
UPDATE public.professional_preferences pp
SET account_owner_id = COALESCE(
  (SELECT p.account_owner_id FROM public.profiles p WHERE p.id = pp.user_id),
  pp.user_id
)
WHERE pp.account_owner_id IS NULL;

ALTER TABLE public.professional_preferences
  ALTER COLUMN account_owner_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_professional_preferences_account_owner
  ON public.professional_preferences(account_owner_id);

-- Autofill trigger (reuse existing helper)
DROP TRIGGER IF EXISTS tg_professional_preferences_autofill_owner ON public.professional_preferences;
CREATE TRIGGER tg_professional_preferences_autofill_owner
  BEFORE INSERT ON public.professional_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_autofill_account_owner_id();

-- Strengthen restrictive policy to use the column directly
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.professional_preferences;
CREATE POLICY tenant_isolation_restrictive ON public.professional_preferences
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR account_owner_id = current_account_owner_id()
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR account_owner_id = current_account_owner_id()
  );
