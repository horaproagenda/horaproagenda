REVOKE ALL ON FUNCTION public.schedule_package_sessions_batch(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_package_schedule_batch(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.autoheal_package_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_package_sessions_batch(uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_package_schedule_batch(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.autoheal_package_schedule(uuid) TO authenticated, service_role;