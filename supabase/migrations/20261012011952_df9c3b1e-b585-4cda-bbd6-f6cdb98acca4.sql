REVOKE EXECUTE ON FUNCTION public.find_package_session_for_appointment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_appointment_status_with_package_mode(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_package_session_for_appointment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_status_with_package_mode(uuid, text, text, integer) TO authenticated;