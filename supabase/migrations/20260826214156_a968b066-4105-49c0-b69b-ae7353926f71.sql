-- 1) professional_credentials: plaintext temp_password must not be readable via the API.
-- The frontend reads only status columns; the password is fetched via the
-- SECURITY DEFINER RPC get_professional_temp_password (expiring access).
REVOKE SELECT ON public.professional_credentials FROM authenticated;
REVOKE SELECT ON public.professional_credentials FROM anon;
GRANT SELECT (professional_id, user_id, must_change_password, set_at, set_by, password_changed_at, updated_at, account_owner_id)
  ON public.professional_credentials TO authenticated;

-- 2) ultramsg_instance_pool: encrypted tokens must not be readable via the API.
-- Super admins keep access to pool metadata; tokens are only consumed by
-- SECURITY DEFINER functions (claim/get) running as the owner.
REVOKE SELECT ON public.ultramsg_instance_pool FROM authenticated;
REVOKE SELECT ON public.ultramsg_instance_pool FROM anon;
GRANT SELECT (id, api_url, instance_id, status, assigned_professional_id, assigned_at, notes, monthly_cost_usd, activated_at, created_at, updated_at)
  ON public.ultramsg_instance_pool TO authenticated;

-- 3) waitlist: created_by must always bind to the authenticated user (no NULL bypass).
DROP POLICY IF EXISTS restrictive_waitlist_created_by_self ON public.waitlist;
CREATE POLICY restrictive_waitlist_created_by_self
  ON public.waitlist
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Defense in depth: no waitlist row without an identified creator.
-- Existing data has zero NULL created_by rows; the column default auth.uid()
-- keeps frontend inserts working unchanged.
ALTER TABLE public.waitlist ALTER COLUMN created_by SET NOT NULL;