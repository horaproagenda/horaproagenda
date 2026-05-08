
CREATE OR REPLACE FUNCTION public.can_access_appointment(_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = _appointment_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'receptionist'::app_role)
        OR (
          public.has_role(auth.uid(), 'professional'::app_role)
          AND a.professional_id = public.get_professional_id_for_user(auth.uid())
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Scoped subscribe to app realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Scoped publish to app realtime channels" ON realtime.messages;

CREATE POLICY "Scoped subscribe to app realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    realtime.topic() = ANY (ARRAY[
      'realtime-sync-all-v2','reports_realtime','goals-appointments-sync',
      'goals-sales-sync','goals-transactions-sync','absences-appointments-sync',
      'all-appointments-realtime','financial_entries_changes'
    ])
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'receptionist'::app_role))
  )
  OR (
    (
      realtime.topic() LIKE 'client-appointments-realtime-%'
      OR realtime.topic() LIKE 'client-sales-realtime-%'
      OR realtime.topic() LIKE 'client-documents-realtime-%'
      OR realtime.topic() LIKE 'client-photos-realtime-%'
      OR realtime.topic() LIKE 'client-packages-realtime-%'
    )
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
  OR (
    realtime.topic() LIKE 'appointment-locks-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_appointment(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
);

CREATE POLICY "Scoped publish to app realtime channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    realtime.topic() = ANY (ARRAY[
      'realtime-sync-all-v2','reports_realtime','goals-appointments-sync',
      'goals-sales-sync','goals-transactions-sync','absences-appointments-sync',
      'all-appointments-realtime','financial_entries_changes'
    ])
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'receptionist'::app_role))
  )
  OR (
    (
      realtime.topic() LIKE 'client-appointments-realtime-%'
      OR realtime.topic() LIKE 'client-sales-realtime-%'
      OR realtime.topic() LIKE 'client-documents-realtime-%'
      OR realtime.topic() LIKE 'client-photos-realtime-%'
      OR realtime.topic() LIKE 'client-packages-realtime-%'
    )
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
  OR (
    realtime.topic() LIKE 'appointment-locks-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_appointment(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
);
