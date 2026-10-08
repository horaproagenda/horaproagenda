CREATE TABLE public.auto_schedule_rules (
  group_id uuid PRIMARY KEY,
  group_type text NOT NULL,
  preferred_day_of_week smallint,
  preferred_time text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_schedule_rules TO authenticated;
GRANT ALL ON public.auto_schedule_rules TO service_role;
ALTER TABLE public.auto_schedule_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auto rules same account read" ON public.auto_schedule_rules FOR SELECT TO authenticated
  USING (public.get_account_owner_for_user(created_by) = public.get_account_owner_for_user(auth.uid()));
CREATE POLICY "auto rules insert own" ON public.auto_schedule_rules FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "auto rules same account update" ON public.auto_schedule_rules FOR UPDATE TO authenticated
  USING (public.get_account_owner_for_user(created_by) = public.get_account_owner_for_user(auth.uid()));
CREATE POLICY "auto rules same account delete" ON public.auto_schedule_rules FOR DELETE TO authenticated
  USING (public.get_account_owner_for_user(created_by) = public.get_account_owner_for_user(auth.uid()));