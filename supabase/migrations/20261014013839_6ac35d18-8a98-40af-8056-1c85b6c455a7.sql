REVOKE EXECUTE ON FUNCTION public.freeze_document_fill_link_template() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_document_template_version() FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.document_events FROM anon;