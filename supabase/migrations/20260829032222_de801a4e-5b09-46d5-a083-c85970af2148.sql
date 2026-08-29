DROP FUNCTION IF EXISTS public.get_shared_resource_bookings(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_shared_resource_bookings(_from timestamptz, _to timestamptz)
RETURNS TABLE(
  id uuid,
  resource_type text,
  resource_id uuid,
  resource_name text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  client_name text,
  service_name text,
  professional_name text,
  professional_color text,
  amount numeric,
  notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  owner_id uuid;
  mine uuid;
  allowed boolean;
  is_staff boolean;
  perms jsonb;
BEGIN
  IF auth.uid() IS NULL OR _from IS NULL OR _to IS NULL OR _from >= _to THEN
    RETURN;
  END IF;

  owner_id := public.current_account_owner_id();
  IF owner_id IS NULL THEN
    RETURN;
  END IF;

  mine := public.get_professional_id_for_user(auth.uid());
  is_staff := public.is_account_admin(auth.uid())
              OR public.has_role(auth.uid(), 'receptionist'::app_role);

  -- A permissão é sempre conferida no backend; o frontend não controla este acesso.
  allowed := is_staff OR public.perm('agenda', 'view_others');

  IF NOT allowed AND mine IS NOT NULL THEN
    SELECT coalesce(pro.permissions, '{}'::jsonb)
      INTO perms
      FROM public.professionals pro
     WHERE pro.id = mine
       AND pro.account_owner_id = owner_id;
    allowed := coalesce((perms->>'can_view_other_agendas')::boolean, false);
  END IF;

  IF NOT allowed THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id,
         CASE
           WHEN a.room_id IS NOT NULL AND (
             is_staff OR EXISTS (
               SELECT 1
                 FROM public.appointments own_a
                WHERE own_a.account_owner_id = owner_id
                  AND own_a.professional_id = mine
                  AND own_a.room_id = a.room_id
             )
           ) THEN 'room' ELSE 'equipment'
         END::text AS resource_type,
         CASE
           WHEN a.room_id IS NOT NULL AND (
             is_staff OR EXISTS (
               SELECT 1
                 FROM public.appointments own_a
                WHERE own_a.account_owner_id = owner_id
                  AND own_a.professional_id = mine
                  AND own_a.room_id = a.room_id
             )
           ) THEN a.room_id ELSE a.equipment_id
         END AS resource_id,
         NULL::text AS resource_name,
         a.start_time,
         a.end_time,
         a.status::text,
         NULL::text AS client_name,
         NULL::text AS service_name,
         pr.name AS professional_name,
         pr.agenda_color AS professional_color,
         NULL::numeric AS amount,
         NULL::text AS notes
    FROM public.appointments a
    JOIN public.professionals pr
      ON pr.id = a.professional_id
     AND pr.account_owner_id = owner_id
    LEFT JOIN public.rooms r
      ON r.id = a.room_id
     AND r.account_owner_id = owner_id
    LEFT JOIN public.equipment e
      ON e.id = a.equipment_id
     AND e.account_owner_id = owner_id
   WHERE a.account_owner_id = owner_id
     AND a.professional_id IS NOT NULL
     AND (
       (a.room_id IS NOT NULL AND r.id IS NOT NULL)
       OR (a.equipment_id IS NOT NULL AND e.id IS NOT NULL)
     )
     AND a.start_time < _to
     AND a.end_time > _from
     AND a.status::text NOT IN ('completed', 'cancelled', 'missed')
     AND (mine IS NULL OR a.professional_id IS DISTINCT FROM mine)
     AND (
       is_staff
       OR EXISTS (
         SELECT 1
           FROM public.appointments own_a
          WHERE own_a.account_owner_id = owner_id
            AND own_a.professional_id = mine
            AND (
              (a.room_id IS NOT NULL AND own_a.room_id = a.room_id)
              OR (a.equipment_id IS NOT NULL AND own_a.equipment_id = a.equipment_id)
            )
       )
     );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shared_resource_bookings(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_resource_bookings(timestamptz, timestamptz) TO authenticated;