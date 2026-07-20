
DROP FUNCTION IF EXISTS public.super_admin_list_pending_whatsapp_releases();

CREATE OR REPLACE FUNCTION public.super_admin_list_pending_whatsapp_releases()
 RETURNS TABLE(request_id uuid, created_at timestamp with time zone, approved_at timestamp with time zone, is_approved boolean, has_pool_instance boolean, free_pool_instances integer, email_hint text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         (SELECT n FROM pool) AS free_pool_instances,
         CASE
           WHEN p.email IS NULL OR position('@' in p.email) < 2 THEN NULL
           ELSE substr(split_part(p.email, '@', 1), 1, 2)
                || '***@'
                || split_part(p.email, '@', 2)
         END AS email_hint
  FROM public.professionals p
  WHERE COALESCE(p.whatsapp_release_approved, false) = false
     OR COALESCE(p.whatsapp_release_approved, false) = true
  ORDER BY COALESCE(p.whatsapp_release_approved, false) ASC, p.created_at DESC
  LIMIT 200;
END;
$function$;
