-- Tighten product inventory visibility: remove unauthenticated public read access
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view product purchases" ON public.product_purchases;

CREATE POLICY "Authenticated staff can view products"
ON public.products
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated staff can view product purchases"
ON public.product_purchases
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Tighten goals access: business goals are admin/reception scope only
DROP POLICY IF EXISTS "Authenticated can view goals" ON public.goals;
DROP POLICY IF EXISTS "Authenticated can insert goals" ON public.goals;
DROP POLICY IF EXISTS "Authenticated can update goals" ON public.goals;
DROP POLICY IF EXISTS "Authenticated can delete goals" ON public.goals;

CREATE POLICY "Admins and receptionists can view goals"
ON public.goals
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
);

CREATE POLICY "Admins and receptionists can insert goals"
ON public.goals
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
);

CREATE POLICY "Admins and receptionists can update goals"
ON public.goals
FOR UPDATE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
);

CREATE POLICY "Admins and receptionists can delete goals"
ON public.goals
FOR DELETE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
);

-- Tighten professionals visibility: remove broad all-row read policy
DROP POLICY IF EXISTS "Authenticated users can view professionals" ON public.professionals;

CREATE POLICY "Admins and receptionists can view professionals"
ON public.professionals
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'receptionist'::public.app_role)
);

-- Prevent direct RPC execution of SECURITY DEFINER helper functions by API roles.
-- These helpers remain available inside RLS/storage policies but are not callable directly by clients.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_professional_id_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_client_record(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_client_photo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_client_storage_object(text, text) FROM PUBLIC, anon, authenticated;

-- Disable GraphQL API access for client API roles; the app uses Supabase REST/Realtime, not GraphQL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    REVOKE USAGE ON SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- Add explicit Realtime channel authorization for authenticated app users.
-- Channel topics are restricted to known application namespaces instead of allowing arbitrary topics.
DO $$
BEGIN
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Authenticated users can subscribe to app realtime channels" ON realtime.messages;
  DROP POLICY IF EXISTS "Authenticated users can publish to app realtime channels" ON realtime.messages;

  CREATE POLICY "Authenticated users can subscribe to app realtime channels"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = ANY (ARRAY[
      'realtime-sync-all-v2',
      'reports_realtime',
      'goals-appointments-sync',
      'goals-sales-sync',
      'goals-transactions-sync',
      'absences-appointments-sync',
      'all-appointments-realtime',
      'financial_entries_changes'
    ])
    OR realtime.topic() LIKE 'client-appointments-realtime-%'
    OR realtime.topic() LIKE 'client-sales-realtime-%'
    OR realtime.topic() LIKE 'all-packages-realtime-for-profile-%'
    OR realtime.topic() LIKE 'client-documents-realtime-%'
    OR realtime.topic() LIKE 'client-photos-realtime-%'
    OR realtime.topic() LIKE 'client-packages-realtime-%'
    OR realtime.topic() LIKE 'appointment-locks-%'
    OR realtime.topic() LIKE 'package-appointments-credits-%'
  );

  CREATE POLICY "Authenticated users can publish to app realtime channels"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() = ANY (ARRAY[
      'realtime-sync-all-v2',
      'reports_realtime',
      'goals-appointments-sync',
      'goals-sales-sync',
      'goals-transactions-sync',
      'absences-appointments-sync',
      'all-appointments-realtime',
      'financial_entries_changes'
    ])
    OR realtime.topic() LIKE 'client-appointments-realtime-%'
    OR realtime.topic() LIKE 'client-sales-realtime-%'
    OR realtime.topic() LIKE 'all-packages-realtime-for-profile-%'
    OR realtime.topic() LIKE 'client-documents-realtime-%'
    OR realtime.topic() LIKE 'client-photos-realtime-%'
    OR realtime.topic() LIKE 'client-packages-realtime-%'
    OR realtime.topic() LIKE 'appointment-locks-%'
    OR realtime.topic() LIKE 'package-appointments-credits-%'
  );
EXCEPTION
  WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
    RAISE NOTICE 'Realtime authorization policy setup skipped: %', SQLERRM;
END $$;