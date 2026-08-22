-- Funções de permissão não devem ser executáveis por visitantes anônimos
REVOKE EXECUTE ON FUNCTION public.perm(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.perm_scope(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_see_record(uuid, public.data_visibility, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_record(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_account_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_see_appointment_row(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_shared_room_bookings(timestamptz, timestamptz) FROM anon;

GRANT EXECUTE ON FUNCTION public.perm(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perm_scope(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_admin(uuid) TO authenticated;