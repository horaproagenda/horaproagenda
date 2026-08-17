ALTER TABLE public.professionals DISABLE TRIGGER USER;
UPDATE public.professionals
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('can_view_other_services', true)
WHERE permissions->>'can_view_other_services' IS NULL;
ALTER TABLE public.professionals ENABLE TRIGGER USER;