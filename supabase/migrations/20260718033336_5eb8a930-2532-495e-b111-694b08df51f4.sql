
-- Anonymous WhatsApp release flow for the platform owner (super admin).
-- These RPCs are the ONLY surface the super admin UI uses to see or approve
-- releases, so no PII (name, email, phone, account_owner_id) is ever returned.

CREATE OR REPLACE FUNCTION public.super_admin_list_pending_whatsapp_releases()
RETURNS TABLE (
  request_id uuid,
  created_at timestamptz,
  free_pool_instances integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH pool AS (
    SELECT count(*)::int AS n
    FROM public.ultramsg_instance_pool
    WHERE status = 'free' AND assigned_professional_id IS NULL
  )
  SELECT p.id AS request_id,
         p.created_at,
         (SELECT n FROM pool) AS free_pool_instances
  FROM public.professionals p
  WHERE COALESCE(p.whatsapp_release_approved, false) = false
  ORDER BY p.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_approve_whatsapp_release(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
  v_free_left int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.professionals
     SET whatsapp_release_approved = true,
         updated_at = now()
   WHERE id = p_request_id
     AND COALESCE(whatsapp_release_approved, false) = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*)::int INTO v_free_left
    FROM public.ultramsg_instance_pool
   WHERE status = 'free' AND assigned_professional_id IS NULL;

  RETURN jsonb_build_object(
    'approved', v_updated > 0,
    'free_pool_instances', v_free_left
  );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_list_pending_whatsapp_releases() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_approve_whatsapp_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_list_pending_whatsapp_releases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_approve_whatsapp_release(uuid) TO authenticated;
