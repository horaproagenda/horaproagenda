
-- Fix: overlay of per-professional preferences was silently failing because the
-- SECURITY DEFINER RPC had no EXECUTE grant for the authenticated role.
-- Also scope the global business_settings pick to the caller's tenant so that
-- the correct closing_time is used when multiple tenants exist.

CREATE OR REPLACE FUNCTION public.get_effective_business_settings(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g record;
  o record;
  _owner uuid;
BEGIN
  -- Resolve the account owner for this user. Falls back to _user_id itself
  -- when they are the account owner.
  SELECT COALESCE(
    (SELECT account_owner_id FROM public.profiles WHERE id = _user_id),
    _user_id
  ) INTO _owner;

  SELECT * INTO g
  FROM public.business_settings
  WHERE account_owner_id = _owner
  ORDER BY created_at ASC
  LIMIT 1;

  IF g IS NULL THEN
    SELECT * INTO g FROM public.business_settings LIMIT 1;
  END IF;

  SELECT * INTO o FROM public.professional_preferences WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'opening_time',                  COALESCE(o.opening_time::text,           g.opening_time::text),
    'closing_time',                  COALESCE(o.closing_time::text,           g.closing_time::text),
    'slot_interval',                 COALESCE(o.slot_interval,                g.slot_interval),
    'work_saturdays',                COALESCE(o.work_saturdays,               g.work_saturdays),
    'work_sundays',                  COALESCE(o.work_sundays,                 g.work_sundays),
    'saturday_opening_time',         COALESCE(o.saturday_opening_time,        g.saturday_opening_time),
    'saturday_closing_time',         COALESCE(o.saturday_closing_time,        g.saturday_closing_time),
    'sunday_opening_time',           COALESCE(o.sunday_opening_time,          g.sunday_opening_time),
    'sunday_closing_time',           COALESCE(o.sunday_closing_time,          g.sunday_closing_time),
    'timezone',                      COALESCE(o.timezone,                     g.timezone),
    'drag_and_drop_enabled',         COALESCE(o.drag_and_drop_enabled,        g.drag_and_drop_enabled),
    'auto_complete_appointments',    COALESCE(o.auto_complete_appointments,   g.auto_complete_appointments),
    'automation_whatsapp_reminders', COALESCE(o.automation_whatsapp_reminders,g.automation_whatsapp_reminders),
    'automation_waitlist',           COALESCE(o.automation_waitlist,          g.automation_waitlist),
    'automation_gap_finder',         COALESCE(o.automation_gap_finder,        g.automation_gap_finder),
    'automation_occupancy_dashboard',COALESCE(o.automation_occupancy_dashboard, g.automation_occupancy_dashboard),
    'automation_smart_recurrence',   COALESCE(o.automation_smart_recurrence,  g.automation_smart_recurrence),
    'reminder_hours_before',         COALESCE(to_jsonb(o.reminder_hours_before), to_jsonb(g.reminder_hours_before)),
    'quiet_hours_start',             COALESCE(o.quiet_hours_start,            NULL),
    'quiet_hours_end',               COALESCE(o.quiet_hours_end,              NULL),
    'has_override',                  (o.user_id IS NOT NULL),
    'global_id',                     g.id
  );
END $function$;

GRANT EXECUTE ON FUNCTION public.get_effective_business_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_business_settings(uuid) TO service_role;
