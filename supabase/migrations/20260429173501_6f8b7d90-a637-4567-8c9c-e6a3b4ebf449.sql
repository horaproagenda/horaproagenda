ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_appointment_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_appointment_version ON public.appointments;
CREATE TRIGGER trg_bump_appointment_version
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.bump_appointment_version();

CREATE TABLE IF NOT EXISTS public.appointment_edit_locks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_email text,
  holder_name text,
  session_id text NOT NULL,
  locked_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '2 minutes'),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT appointment_edit_locks_unique_appointment UNIQUE (appointment_id)
);

ALTER TABLE public.appointment_edit_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view locks for accessible appointments" ON public.appointment_edit_locks;
CREATE POLICY "Users can view locks for accessible appointments"
ON public.appointment_edit_locks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = appointment_edit_locks.appointment_id
  )
);

DROP POLICY IF EXISTS "Users can create own appointment locks" ON public.appointment_edit_locks;
CREATE POLICY "Users can create own appointment locks"
ON public.appointment_edit_locks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.id = appointment_edit_locks.appointment_id
  )
);

DROP POLICY IF EXISTS "Users can renew own appointment locks" ON public.appointment_edit_locks;
CREATE POLICY "Users can renew own appointment locks"
ON public.appointment_edit_locks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR expires_at < now())
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own appointment locks" ON public.appointment_edit_locks;
CREATE POLICY "Users can remove own appointment locks"
ON public.appointment_edit_locks
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role) OR expires_at < now());

CREATE OR REPLACE FUNCTION public.touch_appointment_edit_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_seen_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_appointment_edit_lock ON public.appointment_edit_locks;
CREATE TRIGGER trg_touch_appointment_edit_lock
BEFORE UPDATE ON public.appointment_edit_locks
FOR EACH ROW
EXECUTE FUNCTION public.touch_appointment_edit_lock();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'appointment_edit_locks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_edit_locks;
  END IF;
END $$;