
DROP FUNCTION IF EXISTS public.super_admin_list_pending_whatsapp_releases();

CREATE FUNCTION public.super_admin_list_pending_whatsapp_releases()
RETURNS TABLE (
  request_id uuid,
  created_at timestamptz,
  approved_at timestamptz,
  is_approved boolean,
  has_pool_instance boolean,
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
         p.whatsapp_release_approved_at AS approved_at,
         COALESCE(p.whatsapp_release_approved, false) AS is_approved,
         EXISTS (
           SELECT 1 FROM public.ultramsg_instance_pool u
           WHERE u.assigned_professional_id = p.id
         ) AS has_pool_instance,
         (SELECT n FROM pool) AS free_pool_instances
  FROM public.professionals p
  WHERE COALESCE(p.whatsapp_release_approved, false) = false
     OR EXISTS (
       SELECT 1 FROM public.ultramsg_instance_pool u
       WHERE u.assigned_professional_id = p.id
     )
  ORDER BY COALESCE(p.whatsapp_release_approved, false) ASC, p.created_at DESC
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
  v_updated int := 0;
  v_free_left int;
  v_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wa_release:' || p_request_id::text, 0)
  );

  SELECT EXISTS (SELECT 1 FROM public.professionals WHERE id = p_request_id)
    INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.professionals
     SET whatsapp_release_approved = true,
         whatsapp_release_approved_at = COALESCE(whatsapp_release_approved_at, now()),
         whatsapp_release_approved_by = COALESCE(whatsapp_release_approved_by, auth.uid()),
         updated_at = now()
   WHERE id = p_request_id
     AND COALESCE(whatsapp_release_approved, false) = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*)::int INTO v_free_left
    FROM public.ultramsg_instance_pool
   WHERE status = 'free' AND assigned_professional_id IS NULL;

  RETURN jsonb_build_object(
    'approved', v_updated > 0,
    'already_approved', v_updated = 0,
    'free_pool_instances', v_free_left
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_revoke_whatsapp_release(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool_released int := 0;
  v_creds_deactivated int := 0;
  v_flag_cleared int := 0;
  v_free_left int;
  v_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('wa_release:' || p_request_id::text, 0)
  );

  SELECT EXISTS (SELECT 1 FROM public.professionals WHERE id = p_request_id)
    INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH pool_rows AS (
    SELECT instance_id
    FROM public.ultramsg_instance_pool
    WHERE assigned_professional_id = p_request_id
  ),
  upd AS (
    UPDATE public.professional_whatsapp_credentials c
       SET is_active = false,
           updated_at = now()
     WHERE c.professional_id = p_request_id
       AND c.instance_id IN (SELECT instance_id FROM pool_rows)
    RETURNING 1
  )
  SELECT count(*) INTO v_creds_deactivated FROM upd;

  WITH released AS (
    UPDATE public.ultramsg_instance_pool
       SET status = 'free',
           assigned_professional_id = NULL,
           assigned_at = NULL,
           activated_at = NULL,
           updated_at = now()
     WHERE assigned_professional_id = p_request_id
    RETURNING 1
  )
  SELECT count(*) INTO v_pool_released FROM released;

  UPDATE public.professionals
     SET whatsapp_release_approved = false,
         whatsapp_release_approved_at = NULL,
         whatsapp_release_approved_by = NULL,
         updated_at = now()
   WHERE id = p_request_id
     AND COALESCE(whatsapp_release_approved, false) = true;

  GET DIAGNOSTICS v_flag_cleared = ROW_COUNT;

  SELECT count(*)::int INTO v_free_left
    FROM public.ultramsg_instance_pool
   WHERE status = 'free' AND assigned_professional_id IS NULL;

  RETURN jsonb_build_object(
    'revoked', (v_flag_cleared + v_pool_released + v_creds_deactivated) > 0,
    'pool_instances_released', v_pool_released,
    'credentials_deactivated', v_creds_deactivated,
    'free_pool_instances', v_free_left
  );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_list_pending_whatsapp_releases() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_approve_whatsapp_release(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.super_admin_revoke_whatsapp_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_list_pending_whatsapp_releases() TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_approve_whatsapp_release(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_revoke_whatsapp_release(uuid) TO authenticated;
