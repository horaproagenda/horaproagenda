
-- Helper: extract trailing UUID from a topic name like 'client-appointments-realtime-<uuid>'
CREATE OR REPLACE FUNCTION public.realtime_topic_suffix_uuid(_topic text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(_topic, '^.*-([0-9a-fA-F-]{36})$', '\1'), _topic)::uuid;
$$;

-- Drop existing broad policies
DROP POLICY IF EXISTS "Authenticated users can subscribe to app realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can publish to app realtime channels" ON realtime.messages;

-- SELECT (subscribe)
CREATE POLICY "Scoped subscribe to app realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Global cache-invalidation channels: any authenticated user
  realtime.topic() = ANY (ARRAY[
    'realtime-sync-all-v2','reports_realtime','goals-appointments-sync',
    'goals-sales-sync','goals-transactions-sync','absences-appointments-sync',
    'all-appointments-realtime','financial_entries_changes'
  ])
  -- Client-scoped channels: must have access to that client
  OR (
    (realtime.topic() LIKE 'client-appointments-realtime-%'
      OR realtime.topic() LIKE 'client-sales-realtime-%'
      OR realtime.topic() LIKE 'client-documents-realtime-%'
      OR realtime.topic() LIKE 'client-photos-realtime-%'
      OR realtime.topic() LIKE 'client-packages-realtime-%')
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_client_record(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
  -- Profile-scoped channel: must be the owner
  OR (
    realtime.topic() LIKE 'all-packages-realtime-for-profile-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) = auth.uid()
  )
  -- Package-scoped credits channel
  OR (
    realtime.topic() LIKE 'package-appointments-credits-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_service_package(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
  -- Appointment lock channels: any authenticated (lock coordination only)
  OR realtime.topic() LIKE 'appointment-locks-%'
);

-- INSERT (publish)
CREATE POLICY "Scoped publish to app realtime channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- Global channels: only admin/receptionist may publish
  (
    realtime.topic() = ANY (ARRAY[
      'realtime-sync-all-v2','reports_realtime','goals-appointments-sync',
      'goals-sales-sync','goals-transactions-sync','absences-appointments-sync',
      'all-appointments-realtime','financial_entries_changes'
    ])
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    )
  )
  -- Client-scoped channels: must have access to that client
  OR (
    (realtime.topic() LIKE 'client-appointments-realtime-%'
      OR realtime.topic() LIKE 'client-sales-realtime-%'
      OR realtime.topic() LIKE 'client-documents-realtime-%'
      OR realtime.topic() LIKE 'client-photos-realtime-%'
      OR realtime.topic() LIKE 'client-packages-realtime-%')
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_client_record(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
  OR (
    realtime.topic() LIKE 'all-packages-realtime-for-profile-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) = auth.uid()
  )
  OR (
    realtime.topic() LIKE 'package-appointments-credits-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_service_package(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
  OR realtime.topic() LIKE 'appointment-locks-%'
);
