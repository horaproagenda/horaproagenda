-- Rollback: recreate privacy_visibility_update/delete restrictive policies using can_write_record.
DROP POLICY IF EXISTS "privacy_visibility_update" ON public.products;
DROP POLICY IF EXISTS "privacy_visibility_delete" ON public.products;
DROP POLICY IF EXISTS "privacy_visibility_update" ON public.document_templates;
DROP POLICY IF EXISTS "privacy_visibility_delete" ON public.document_templates;