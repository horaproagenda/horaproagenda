ALTER TABLE public.package_appointments
ADD COLUMN IF NOT EXISTS original_session_number integer;

UPDATE public.package_appointments
SET original_session_number = session_number
WHERE original_session_number IS NULL;

ALTER TABLE public.package_appointments
ALTER COLUMN original_session_number SET NOT NULL;

CREATE OR REPLACE FUNCTION public.preserve_package_original_session_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.original_session_number := COALESCE(NEW.original_session_number, NEW.session_number);
    RETURN NEW;
  END IF;

  NEW.original_session_number := OLD.original_session_number;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_package_original_session_number_trigger ON public.package_appointments;
CREATE TRIGGER preserve_package_original_session_number_trigger
BEFORE INSERT OR UPDATE ON public.package_appointments
FOR EACH ROW
EXECUTE FUNCTION public.preserve_package_original_session_number();