
-- 1. phone_contacts: scope by room membership
DROP POLICY IF EXISTS "Authenticated users can view phone_contacts" ON public.phone_contacts;
DROP POLICY IF EXISTS "Authenticated users can insert phone_contacts" ON public.phone_contacts;

CREATE POLICY "Members can view phone_contacts of their rooms"
ON public.phone_contacts FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.room_members rm
    WHERE rm.room_id = phone_contacts.room_id AND rm.user_id = auth.uid()
  )
);

CREATE POLICY "Members can insert phone_contacts in their rooms"
ON public.phone_contacts FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.room_members rm
    WHERE rm.room_id = phone_contacts.room_id AND rm.user_id = auth.uid()
  )
);

-- 2. room_members: scope by membership
DROP POLICY IF EXISTS "Authenticated users can view room_members" ON public.room_members;
DROP POLICY IF EXISTS "Authenticated users can insert room_members" ON public.room_members;

CREATE POLICY "Users can view room_members of their rooms"
ON public.room_members FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.room_members rm2
    WHERE rm2.room_id = room_members.room_id AND rm2.user_id = auth.uid()
  )
);

CREATE POLICY "Admins or self can insert room_members"
ON public.room_members FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR user_id = auth.uid()
);

-- 3. appointment_edit_locks: drop user_email PII column entirely
ALTER TABLE public.appointment_edit_locks DROP COLUMN IF EXISTS user_email;

-- 4. realtime.messages: scope global channel SELECT to admin/receptionist
DROP POLICY IF EXISTS "Scoped subscribe to app realtime channels" ON realtime.messages;

CREATE POLICY "Scoped subscribe to app realtime channels"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  (
    realtime.topic() = ANY (ARRAY[
      'realtime-sync-all-v2'::text,
      'reports_realtime'::text,
      'goals-appointments-sync'::text,
      'goals-sales-sync'::text,
      'goals-transactions-sync'::text,
      'absences-appointments-sync'::text,
      'all-appointments-realtime'::text,
      'financial_entries_changes'::text
    ])
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
    )
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
  OR realtime.topic() LIKE 'appointment-locks-%'
);
