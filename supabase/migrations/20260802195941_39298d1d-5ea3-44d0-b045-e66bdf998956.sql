
-- The topic parser is a pure text function used inside realtime RLS policies and
-- must be executable by every role that evaluates those policies.
GRANT EXECUTE ON FUNCTION public.realtime_topic_suffix_uuid(text) TO PUBLIC;

-- Allow the platform/admin role to run the self-checks.
GRANT EXECUTE ON FUNCTION public.security_check_temp_password_protected() TO postgres;
GRANT EXECUTE ON FUNCTION public.enforce_temp_password_column_privileges() TO postgres;
