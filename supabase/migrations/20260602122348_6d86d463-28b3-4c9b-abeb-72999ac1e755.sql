CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  preferred_date date,
  preferred_time_start time without time zone,
  preferred_time_end time without time zone,
  notes text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'scheduled', 'expired')),
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist TO authenticated;
GRANT ALL ON public.waitlist TO service_role;

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_waitlist_client_id ON public.waitlist(client_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_service_id ON public.waitlist(service_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_professional_id ON public.waitlist(professional_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status_created_at ON public.waitlist(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_waitlist_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_waitlist_updated_at ON public.waitlist;
CREATE TRIGGER trg_update_waitlist_updated_at
BEFORE UPDATE ON public.waitlist
FOR EACH ROW
EXECUTE FUNCTION public.update_waitlist_updated_at();

DROP POLICY IF EXISTS "Users can view relevant waitlist" ON public.waitlist;
CREATE POLICY "Users can view relevant waitlist"
ON public.waitlist
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = waitlist.client_id
      AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can insert relevant waitlist" ON public.waitlist;
CREATE POLICY "Users can insert relevant waitlist"
ON public.waitlist
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = waitlist.client_id
      AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update relevant waitlist" ON public.waitlist;
CREATE POLICY "Users can update relevant waitlist"
ON public.waitlist
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = waitlist.client_id
      AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = waitlist.client_id
      AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can delete relevant waitlist" ON public.waitlist;
CREATE POLICY "Users can delete relevant waitlist"
ON public.waitlist
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'receptionist'::public.app_role)
  OR professional_id = public.get_professional_id_for_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = waitlist.client_id
      AND c.assigned_professional_id = public.get_professional_id_for_user(auth.uid())
  )
);

ALTER TABLE public.waitlist REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'waitlist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
  END IF;
END $$;