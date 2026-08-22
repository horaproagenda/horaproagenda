-- Corrige o trigger de auditoria de permissões: não gravar sem contexto de auth
CREATE OR REPLACE FUNCTION public.tg_audit_permission_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_audit_visibility_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
      NEW.visibility IS DISTINCT FROM OLD.visibility
      OR NEW.owner_professional_id IS DISTINCT FROM OLD.owner_professional_id) THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'visibility_change', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('visibility', OLD.visibility, 'owner_professional_id', OLD.owner_professional_id),
            jsonb_build_object('visibility', NEW.visibility, 'owner_professional_id', NEW.owner_professional_id));
  END IF;
  RETURN NEW;
END;
$$;

-- 1. Preserva o comportamento atual de quem já tinha permissões salvas
UPDATE public.user_permissions
SET can_view_others   = can_view,
    can_edit_others   = can_edit,
    can_delete_others = can_delete,
    can_export        = can_view,
    can_print         = can_view,
    can_view_values   = can_view,
    can_share         = can_view,
    data_scope        = 'all'
WHERE can_view_others = false
  AND can_edit_others = false
  AND can_delete_others = false
  AND can_export = false
  AND can_print = false
  AND can_view_values = false
  AND can_share = false;

-- 2. Privacidade de salas compartilhadas (por profissional)
ALTER TABLE public.professional_preferences
  ADD COLUMN IF NOT EXISTS shared_room_mode text NOT NULL DEFAULT 'time_only',
  ADD COLUMN IF NOT EXISTS shared_room_see_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_room_see_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_room_see_value boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_room_see_professional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_room_see_status boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shared_room_see_notes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_room_see_documents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_room_see_financial boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'professional_preferences_shared_room_mode_check') THEN
    ALTER TABLE public.professional_preferences
      ADD CONSTRAINT professional_preferences_shared_room_mode_check
      CHECK (shared_room_mode IN ('time_only','authorized'));
  END IF;
END $$;

-- 3. RLS da agenda
CREATE OR REPLACE FUNCTION public.can_see_appointment_row(_professional_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mine uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF public.is_account_admin(auth.uid()) THEN RETURN true; END IF;
  IF public.perm('agenda', 'view_others') THEN RETURN true; END IF;
  mine := public.get_professional_id_for_user(auth.uid());
  IF mine IS NULL THEN RETURN true; END IF;
  RETURN _professional_id IS NULL OR _professional_id = mine;
END;
$$;

DROP POLICY IF EXISTS agenda_privacy_select ON public.appointments;
CREATE POLICY agenda_privacy_select ON public.appointments
AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.can_see_appointment_row(professional_id));

DROP POLICY IF EXISTS agenda_privacy_update ON public.appointments;
CREATE POLICY agenda_privacy_update ON public.appointments
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.can_see_appointment_row(professional_id));

-- 4. Reservas de salas compartilhadas (mascaradas no servidor)
CREATE OR REPLACE FUNCTION public.get_shared_room_bookings(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  room_name text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  client_name text,
  service_name text,
  professional_name text,
  amount numeric,
  notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  owner_id uuid;
  mine uuid;
  p public.professional_preferences;
  authorized boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  owner_id := public.current_account_owner_id();
  mine := public.get_professional_id_for_user(auth.uid());

  SELECT * INTO p FROM public.professional_preferences
   WHERE professional_id = mine LIMIT 1;
  authorized := coalesce(p.shared_room_mode, 'time_only') = 'authorized';

  RETURN QUERY
  SELECT a.id,
         a.room_id,
         r.name,
         a.start_time,
         a.end_time,
         CASE WHEN NOT authorized OR coalesce(p.shared_room_see_status, true)
              THEN a.status::text ELSE NULL END,
         CASE WHEN authorized AND coalesce(p.shared_room_see_client, false)
              THEN c.name ELSE NULL END,
         CASE WHEN authorized AND coalesce(p.shared_room_see_service, false)
              THEN coalesce(s.name, a.service_name_snapshot) ELSE NULL END,
         CASE WHEN authorized AND coalesce(p.shared_room_see_professional, false)
              THEN pr.name ELSE NULL END,
         CASE WHEN authorized AND coalesce(p.shared_room_see_value, false)
              THEN a.amount_paid ELSE NULL END,
         CASE WHEN authorized AND coalesce(p.shared_room_see_notes, false)
              THEN a.notes ELSE NULL END
  FROM public.appointments a
  JOIN public.rooms r ON r.id = a.room_id
  LEFT JOIN public.clients c ON c.id = a.client_id
  LEFT JOIN public.services s ON s.id = a.service_id
  LEFT JOIN public.professionals pr ON pr.id = a.professional_id
  WHERE a.account_owner_id = owner_id
    AND a.room_id IS NOT NULL
    AND a.start_time >= _from
    AND a.start_time <  _to
    AND a.status <> 'cancelled'
    AND (mine IS NULL OR a.professional_id IS DISTINCT FROM mine);
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_room_bookings(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_room_bookings(timestamptz, timestamptz) TO authenticated;

-- 5. Auditoria de visibilidade
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','services','package_templates','service_packages','products','client_documents','document_templates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_audit_visibility ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tg_audit_visibility AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_audit_visibility_change()', t);
  END LOOP;
END $$;