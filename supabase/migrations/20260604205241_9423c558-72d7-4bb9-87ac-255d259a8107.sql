
-- ============================================================
-- F1: Per-user preference overrides (overlay on business_settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.professional_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- horários (NULL = herdar do global)
  opening_time           time,
  closing_time           time,
  slot_interval          integer,
  work_saturdays         boolean,
  work_sundays           boolean,
  saturday_opening_time  text,
  saturday_closing_time  text,
  sunday_opening_time    text,
  sunday_closing_time    text,
  timezone               text,

  -- prefs de agenda
  drag_and_drop_enabled       boolean,
  auto_complete_appointments  boolean,

  -- automações
  automation_whatsapp_reminders     boolean,
  automation_waitlist               boolean,
  automation_gap_finder             boolean,
  automation_occupancy_dashboard    boolean,
  automation_smart_recurrence       boolean,
  reminder_hours_before             integer[],
  quiet_hours_start                 integer,
  quiet_hours_end                   integer,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_preferences TO authenticated;
GRANT ALL ON public.professional_preferences TO service_role;

ALTER TABLE public.professional_preferences ENABLE ROW LEVEL SECURITY;

-- Cada usuário gerencia a própria linha
CREATE POLICY "Users manage own preferences (select)"
  ON public.professional_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage own preferences (insert)"
  ON public.professional_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users manage own preferences (update)"
  ON public.professional_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete preferences"
  ON public.professional_preferences FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_professional_preferences_updated_at ON public.professional_preferences;
CREATE TRIGGER trg_professional_preferences_updated_at
  BEFORE UPDATE ON public.professional_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ============================================================
-- Merge helper: global business_settings + user override
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_effective_business_settings(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  o record;
BEGIN
  SELECT * INTO g FROM public.business_settings LIMIT 1;
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
END $$;

REVOKE ALL ON FUNCTION public.get_effective_business_settings(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_effective_business_settings(uuid) TO authenticated, service_role;
