
CREATE TABLE IF NOT EXISTS public.daily_summary_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_owner_id uuid NOT NULL,
  sent_date date NOT NULL,
  bills_count int NOT NULL DEFAULT 0,
  reminders_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_owner_id, sent_date)
);

GRANT ALL ON public.daily_summary_log TO service_role;

ALTER TABLE public.daily_summary_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.daily_summary_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
