CREATE OR REPLACE FUNCTION public.super_admin_purge_owner_data(_owner_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  child_ids uuid[];
  sql text;
  total_deleted bigint := 0;
  table_count integer := 0;
  result jsonb := '{}'::jsonb;
BEGIN
  -- Allow service_role (edge functions) OR an authenticated super_admin
  IF current_setting('role', true) <> 'service_role'
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  IF _owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id is required';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO child_ids
  FROM public.profiles
  WHERE account_owner_id = _owner_user_id AND id <> _owner_user_id;

  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'account_owner_id'
      AND c.table_name NOT IN ('profiles')
    ORDER BY c.table_name
  LOOP
    BEGIN
      sql := format('DELETE FROM public.%I WHERE account_owner_id = $1', r.table_name);
      EXECUTE sql USING _owner_user_id;
      GET DIAGNOSTICS total_deleted = ROW_COUNT;
      table_count := table_count + 1;
      result := result || jsonb_build_object(r.table_name, total_deleted);
    EXCEPTION WHEN OTHERS THEN
      result := result || jsonb_build_object(r.table_name || '__error', SQLERRM);
    END;
  END LOOP;

  DELETE FROM public.account_subscriptions WHERE owner_user_id = _owner_user_id;
  DELETE FROM public.trial_registrations WHERE user_id = _owner_user_id OR user_id = ANY(child_ids);
  DELETE FROM public.user_roles WHERE user_id = _owner_user_id OR user_id = ANY(child_ids);
  DELETE FROM public.interest_leads WHERE email = (SELECT email FROM public.profiles WHERE id = _owner_user_id);
  DELETE FROM public.terms_acceptances WHERE user_id = _owner_user_id OR user_id = ANY(child_ids);

  DELETE FROM public.profiles WHERE id = ANY(child_ids);
  DELETE FROM public.profiles WHERE id = _owner_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'owner_user_id', _owner_user_id,
    'child_user_ids', child_ids,
    'tables_processed', table_count,
    'per_table', result
  );
END;
$$;