
-- Preserve service and package names on appointments regardless of status changes
-- so the UI can always show the correct name even if the link is detached.

CREATE OR REPLACE FUNCTION public.tg_appointments_capture_name_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_name text;
  v_package_name text;
  v_notes_match text;
BEGIN
  -- Capture service name snapshot from current service link when not yet stored
  IF NEW.service_id IS NOT NULL
     AND (NEW.service_name_snapshot IS NULL OR NEW.service_name_snapshot = '') THEN
    SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
    IF v_service_name IS NOT NULL THEN
      NEW.service_name_snapshot := v_service_name;
    END IF;
  END IF;

  -- Capture package name snapshot when linked to a package session
  IF NEW.package_appointment_id IS NOT NULL
     AND (NEW.package_name_snapshot IS NULL OR NEW.package_name_snapshot = '') THEN
    SELECT sp.name INTO v_package_name
    FROM public.package_appointments pa
    JOIN public.service_packages sp ON sp.id = pa.package_id
    WHERE pa.id = NEW.package_appointment_id;
    IF v_package_name IS NOT NULL THEN
      NEW.package_name_snapshot := v_package_name;
    END IF;
  END IF;

  -- Fallback: parse package name from notes pattern "<Name> - Sessão X de Y"
  IF (NEW.package_name_snapshot IS NULL OR NEW.package_name_snapshot = '')
     AND NEW.notes IS NOT NULL THEN
    v_notes_match := substring(NEW.notes FROM '^(.+?)\s*-\s*Sessão\s+\d+\s+de\s+\d+');
    IF v_notes_match IS NOT NULL AND length(trim(v_notes_match)) > 0 THEN
      NEW.package_name_snapshot := trim(v_notes_match);
    END IF;
  END IF;

  -- Never overwrite an existing snapshot on status/date changes: rule is
  -- "status changes only color/status, name stays the same".
  IF TG_OP = 'UPDATE' THEN
    IF OLD.service_name_snapshot IS NOT NULL AND OLD.service_name_snapshot <> ''
       AND (NEW.service_name_snapshot IS NULL OR NEW.service_name_snapshot = '') THEN
      NEW.service_name_snapshot := OLD.service_name_snapshot;
    END IF;
    IF OLD.package_name_snapshot IS NOT NULL AND OLD.package_name_snapshot <> ''
       AND (NEW.package_name_snapshot IS NULL OR NEW.package_name_snapshot = '') THEN
      NEW.package_name_snapshot := OLD.package_name_snapshot;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_capture_name_snapshots ON public.appointments;
CREATE TRIGGER trg_appointments_capture_name_snapshots
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_appointments_capture_name_snapshots();

-- Backfill snapshots for all existing appointments
UPDATE public.appointments a
SET service_name_snapshot = COALESCE(NULLIF(a.service_name_snapshot, ''), s.name),
    package_name_snapshot = COALESCE(
      NULLIF(a.package_name_snapshot, ''),
      sp.name,
      NULLIF(trim(substring(a.notes FROM '^(.+?)\s*-\s*Sessão\s+\d+\s+de\s+\d+')), '')
    )
FROM public.services s
FULL OUTER JOIN public.package_appointments pa ON true
FULL OUTER JOIN public.service_packages sp ON sp.id = pa.package_id
WHERE (s.id = a.service_id OR s.id IS NULL)
  AND (pa.id = a.package_appointment_id OR pa.id IS NULL)
  AND (
    (a.service_name_snapshot IS NULL OR a.service_name_snapshot = '')
    OR (a.package_name_snapshot IS NULL OR a.package_name_snapshot = '')
  );
