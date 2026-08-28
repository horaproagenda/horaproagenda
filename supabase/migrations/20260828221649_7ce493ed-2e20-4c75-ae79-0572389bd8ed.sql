CREATE OR REPLACE FUNCTION public.get_shared_resource_bookings(_from timestamp with time zone, _to timestamp with time zone)
RETURNS TABLE(
  id uuid,
  resource_type text,
  resource_id uuid,
  resource_name text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  status text,
  client_name text,
  service_name text,
  professional_name text,
  amount numeric,
  notes text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  owner_id uuid;
  mine uuid;
  p public.professional_preferences;
  authorized boolean;
  allowed boolean;
  perms jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  owner_id := public.current_account_owner_id();
  mine := public.get_professional_id_for_user(auth.uid());

  -- Gate: administradores/recepção ou profissional com permissão de ver agenda dos outros
  allowed := public.is_account_admin(auth.uid())
             OR public.has_role(auth.uid(), 'receptionist'::app_role)
             OR public.perm('agenda', 'view_others');

  IF NOT allowed AND mine IS NOT NULL THEN
    SELECT coalesce(pro.permissions, '{}'::jsonb) INTO perms
      FROM public.professionals pro WHERE pro.id = mine;
    allowed := coalesce((perms->>'can_view_other_agendas')::boolean, false);
  END IF;

  IF NOT allowed THEN RETURN; END IF;

  SELECT * INTO p FROM public.professional_preferences
   WHERE user_id = auth.uid() LIMIT 1;
  authorized := coalesce(p.shared_room_mode, 'time_only') = 'authorized';

  RETURN QUERY
  SELECT a.id,
         CASE WHEN a.room_id IS NOT NULL THEN 'room' ELSE 'equipment' END::text,
         coalesce(a.room_id, a.equipment_id),
         coalesce(r.name, e.name),
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
  LEFT JOIN public.rooms r ON r.id = a.room_id
  LEFT JOIN public.equipment e ON e.id = a.equipment_id
  LEFT JOIN public.clients c ON c.id = a.client_id
  LEFT JOIN public.services s ON s.id = a.service_id
  LEFT JOIN public.professionals pr ON pr.id = a.professional_id
  WHERE a.account_owner_id = owner_id
    AND (a.room_id IS NOT NULL OR a.equipment_id IS NOT NULL)
    AND a.start_time >= _from
    AND a.start_time <  _to
    AND a.status::text NOT IN ('cancelled', 'rescheduled')
    AND (mine IS NULL OR a.professional_id IS DISTINCT FROM mine);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_resource_bookings(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_resource_bookings(timestamp with time zone, timestamp with time zone) TO authenticated;