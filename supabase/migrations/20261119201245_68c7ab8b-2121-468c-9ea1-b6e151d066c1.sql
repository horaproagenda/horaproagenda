REVOKE EXECUTE ON FUNCTION public.super_admin_purge_owner_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_purge_owner_data(uuid) TO service_role;