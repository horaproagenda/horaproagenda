-- 1) whatsapp_logs: explicit tenant scope on read (defense in depth; professionals intentionally excluded)
DROP POLICY IF EXISTS "Staff can view whatsapp logs" ON public.whatsapp_logs;
CREATE POLICY "Staff can view whatsapp logs"
ON public.whatsapp_logs
FOR SELECT
TO authenticated
USING (
  account_owner_id = public.current_account_owner_id()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  )
);

-- 2) user_roles: restrictive tenant + admin binding for every write
DROP POLICY IF EXISTS restrictive_role_writes_tenant_admin_only ON public.user_roles;
CREATE POLICY restrictive_role_writes_tenant_admin_only
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id IS NOT NULL
    AND account_owner_id = public.current_account_owner_id()
    AND (
      user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    account_owner_id IS NOT NULL
    AND account_owner_id = public.current_account_owner_id()
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND user_id <> auth.uid()
    AND role = ANY (ARRAY['receptionist'::public.app_role, 'professional'::public.app_role])
  )
);

-- 3) realtime.messages: keep tenant validation, accept current sync channel version (v2/v3/...)
DROP POLICY IF EXISTS "Scoped subscribe to app realtime channels" ON realtime.messages;
CREATE POLICY "Scoped subscribe to app realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    (
      realtime.topic() ~ '^realtime-sync-all-v[0-9]+-'
      OR realtime.topic() LIKE 'reports_realtime-%'
      OR realtime.topic() LIKE 'goals-appointments-sync-%'
      OR realtime.topic() LIKE 'goals-sales-sync-%'
      OR realtime.topic() LIKE 'goals-transactions-sync-%'
      OR realtime.topic() LIKE 'absences-appointments-sync-%'
      OR realtime.topic() LIKE 'all-appointments-realtime-%'
      OR realtime.topic() LIKE 'financial_entries_changes-%'
    )
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.realtime_topic_suffix_uuid(realtime.topic()) = public.current_account_owner_id()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.has_role(auth.uid(), 'professional'::public.app_role)
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
  OR (
    realtime.topic() LIKE 'appointment-locks-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_appointment(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
);

DROP POLICY IF EXISTS "Scoped publish to app realtime channels" ON realtime.messages;
CREATE POLICY "Scoped publish to app realtime channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (
    (
      realtime.topic() ~ '^realtime-sync-all-v[0-9]+-'
      OR realtime.topic() LIKE 'reports_realtime-%'
      OR realtime.topic() LIKE 'goals-appointments-sync-%'
      OR realtime.topic() LIKE 'goals-sales-sync-%'
      OR realtime.topic() LIKE 'goals-transactions-sync-%'
      OR realtime.topic() LIKE 'absences-appointments-sync-%'
      OR realtime.topic() LIKE 'all-appointments-realtime-%'
      OR realtime.topic() LIKE 'financial_entries_changes-%'
    )
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.realtime_topic_suffix_uuid(realtime.topic()) = public.current_account_owner_id()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
      OR public.has_role(auth.uid(), 'professional'::public.app_role)
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
  OR (
    realtime.topic() LIKE 'appointment-locks-%'
    AND public.realtime_topic_suffix_uuid(realtime.topic()) IS NOT NULL
    AND public.can_access_appointment(public.realtime_topic_suffix_uuid(realtime.topic()))
  )
);