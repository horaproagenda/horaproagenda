GRANT EXECUTE ON FUNCTION public.can_access_client_photo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_client_storage_object(text, text) TO authenticated;