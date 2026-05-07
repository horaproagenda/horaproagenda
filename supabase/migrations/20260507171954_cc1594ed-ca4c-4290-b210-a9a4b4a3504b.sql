CREATE TABLE IF NOT EXISTS public.dismissed_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  notification_id text NOT NULL,
  signature text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_id)
);

ALTER TABLE public.dismissed_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_dismissed_notifications"
  ON public.dismissed_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_insert_own_dismissed_notifications"
  ON public.dismissed_notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_update_own_dismissed_notifications"
  ON public.dismissed_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_dismissed_notifications"
  ON public.dismissed_notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_dismissed_notifications_user
  ON public.dismissed_notifications (user_id);