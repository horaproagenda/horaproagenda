-- professional_preferences é chaveada por user_id (não professional_id)
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
   WHERE user_id = auth.uid() LIMIT 1;
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
    AND a.status::text <> 'cancelled'
    AND (mine IS NULL OR a.professional_id IS DISTINCT FROM mine);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_shared_room_bookings(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shared_room_bookings(timestamptz, timestamptz) TO authenticated;