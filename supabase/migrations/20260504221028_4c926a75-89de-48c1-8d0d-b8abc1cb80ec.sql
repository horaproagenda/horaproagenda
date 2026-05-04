
CREATE TABLE IF NOT EXISTS public.professional_credentials (
  professional_id uuid PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  temp_password text,
  must_change_password boolean NOT NULL DEFAULT false,
  set_at timestamptz NOT NULL DEFAULT now(),
  set_by uuid,
  password_changed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prof_creds_user ON public.professional_credentials(user_id);

ALTER TABLE public.professional_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
DROP POLICY IF EXISTS "admins_read_credentials" ON public.professional_credentials;
CREATE POLICY "admins_read_credentials"
ON public.professional_credentials FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins_write_credentials" ON public.professional_credentials;
CREATE POLICY "admins_write_credentials"
ON public.professional_credentials FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Function for the professional themself to clear their forced-change flag
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.professional_credentials
  SET must_change_password = false,
      temp_password = NULL,
      password_changed_at = now(),
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- Function for the professional to check if they must change password (no temp_password leak)
CREATE OR REPLACE FUNCTION public.must_change_password_for_current_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT must_change_password FROM public.professional_credentials WHERE user_id = auth.uid() LIMIT 1),
    false
  );
$$;

CREATE TRIGGER trg_prof_creds_updated_at
BEFORE UPDATE ON public.professional_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
