
CREATE OR REPLACE FUNCTION public.tg_interest_leads_ratelimit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_same INT;
  v_recent_total INT;
BEGIN
  -- Only apply abuse control to anonymous inserts
  IF auth.uid() IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Basic email format check (defense in depth; policy already limits length)
  IF NEW.email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email format' USING ERRCODE = 'check_violation';
  END IF;

  -- Deduplicate: block if same email/whatsapp already submitted in last hour
  SELECT COUNT(*) INTO v_recent_same
  FROM public.interest_leads
  WHERE created_at > now() - interval '1 hour'
    AND (
      lower(email) = lower(NEW.email)
      OR (NEW.whatsapp IS NOT NULL AND whatsapp = NEW.whatsapp)
    );

  IF v_recent_same >= 3 THEN
    RAISE EXCEPTION 'Too many submissions for this contact. Please try again later.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Global anon rate limit: max 30 anonymous leads per 10 minutes across the app
  SELECT COUNT(*) INTO v_recent_total
  FROM public.interest_leads
  WHERE created_at > now() - interval '10 minutes';

  IF v_recent_total >= 30 THEN
    RAISE EXCEPTION 'The form is temporarily rate-limited. Please try again shortly.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interest_leads_ratelimit ON public.interest_leads;
CREATE TRIGGER interest_leads_ratelimit
BEFORE INSERT ON public.interest_leads
FOR EACH ROW EXECUTE FUNCTION public.tg_interest_leads_ratelimit();
