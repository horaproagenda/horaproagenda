-- Reinstala pg_net (necessário para o cron disparar a edge function)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove cron antigo e recria
SELECT cron.unschedule('send-appointment-reminders-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-appointment-reminders-every-5min');

SELECT cron.schedule(
  'send-appointment-reminders-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/send-appointment-reminders',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Dispara execução imediata para lembretes pendentes
SELECT net.http_post(
  url := 'https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/send-appointment-reminders',
  headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE"}'::jsonb,
  body := '{}'::jsonb
);
