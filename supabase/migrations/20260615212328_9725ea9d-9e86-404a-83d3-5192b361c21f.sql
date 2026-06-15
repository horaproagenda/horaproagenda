
-- =========================================================================
-- 1) Realtime: tenant-suffixed shared channels
-- =========================================================================
DROP POLICY IF EXISTS "Scoped subscribe to app realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Scoped publish to app realtime channels" ON realtime.messages;

CREATE POLICY "Scoped subscribe to app realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    (
      realtime.topic() LIKE 'realtime-sync-all-v2-%'
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
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'receptionist'::public.app_role))
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
    (
      realtime.topic() LIKE 'realtime-sync-all-v2-%'
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
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'receptionist'::public.app_role))
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

-- =========================================================================
-- 2) document_fill_links.token — column-level lockdown
-- =========================================================================
REVOKE SELECT ON public.document_fill_links FROM authenticated;
GRANT SELECT (
  id,
  template_id,
  client_id,
  professional_id,
  expires_at,
  filled_at,
  filled_content,
  filled_variables,
  status,
  created_at,
  updated_at,
  account_owner_id
) ON public.document_fill_links TO authenticated;

-- Admin/receptionist accessor for the token (tenant-scoped)
CREATE OR REPLACE FUNCTION public.get_document_fill_link_token(_link_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
  _owner uuid;
BEGIN
  SELECT token, account_owner_id INTO _token, _owner
  FROM public.document_fill_links
  WHERE id = _link_id;

  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  IF _owner IS DISTINCT FROM public.current_account_owner_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'receptionist'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN _token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_document_fill_link_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_document_fill_link_token(uuid) TO authenticated;
