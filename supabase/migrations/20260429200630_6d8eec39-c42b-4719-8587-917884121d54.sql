GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON TYPE public.app_role TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_id_for_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_service_package(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_package_appointment(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_client_record(uuid) TO PUBLIC;