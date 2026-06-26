
ALTER TABLE public.interest_leads
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS contacted_by uuid REFERENCES auth.users(id);

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS whatsapp_release_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_release_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_release_approved_by uuid REFERENCES auth.users(id);

-- Auto-remove interest leads when the person finishes signup (profile is created).
CREATE OR REPLACE FUNCTION public.cleanup_interest_leads_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    DELETE FROM public.interest_leads
    WHERE lower(email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_interest_leads_on_profile ON public.profiles;
CREATE TRIGGER trg_cleanup_interest_leads_on_profile
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_interest_leads_on_signup();
