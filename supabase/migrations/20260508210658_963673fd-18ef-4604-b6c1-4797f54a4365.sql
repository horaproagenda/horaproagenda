-- Access logs (view/access auditing). Distinct from existing audit_logs (DML changes).
CREATE TABLE IF NOT EXISTS public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_role text,
  module text NOT NULL,            -- e.g. 'agenda', 'professional_sensitive'
  action text NOT NULL,            -- 'view' | 'edit' | 'export' | 'open'
  target_type text,                -- e.g. 'professional', 'appointment'
  target_id uuid,
  fields_viewed text[] DEFAULT '{}'::text[],
  fields_changed text[] DEFAULT '{}'::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_user ON public.access_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_module ON public.access_logs (module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_target ON public.access_logs (target_type, target_id);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view access logs" ON public.access_logs;
CREATE POLICY "Admins can view access logs"
  ON public.access_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Block direct inserts/updates/deletes. Inserts must go through log_access().
DROP POLICY IF EXISTS "No direct writes on access logs" ON public.access_logs;
CREATE POLICY "No direct writes on access logs"
  ON public.access_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_access(
  p_module text,
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_fields_viewed text[] DEFAULT '{}'::text[],
  p_fields_changed text[] DEFAULT '{}'::text[],
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  ORDER BY CASE role::text
    WHEN 'admin' THEN 1
    WHEN 'receptionist' THEN 2
    WHEN 'professional' THEN 3
    ELSE 4 END
  LIMIT 1;

  INSERT INTO public.access_logs(
    user_id, user_email, user_role, module, action,
    target_type, target_id, fields_viewed, fields_changed, metadata
  ) VALUES (
    v_user_id, v_email, v_role, p_module, p_action,
    p_target_type, p_target_id,
    COALESCE(p_fields_viewed, '{}'::text[]),
    COALESCE(p_fields_changed, '{}'::text[]),
    COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_access(text, text, text, uuid, text[], text[], jsonb) TO authenticated;