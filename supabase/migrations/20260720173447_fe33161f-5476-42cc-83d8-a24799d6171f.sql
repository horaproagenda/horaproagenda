-- Allow Super Admin to write the token when creating/updating pool instances,
-- while keeping plaintext SELECT revoked (only service_role / SECURITY DEFINER RPCs may read).
GRANT INSERT (token), UPDATE (token) ON public.ultramsg_instance_pool TO authenticated;
REVOKE SELECT (token) ON public.ultramsg_instance_pool FROM authenticated, anon;