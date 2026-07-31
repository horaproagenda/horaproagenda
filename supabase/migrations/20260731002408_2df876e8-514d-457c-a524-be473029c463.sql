select cron.unschedule('whatsapp-pool-healthcheck-5min');
select cron.unschedule('test-cron-now');
select cron.schedule(
  'whatsapp-keepalive-3min',
  '*/3 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/whatsapp-keepalive',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ2NsbHJic3dvZGpvYWR5YnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NTQ5NjcsImV4cCI6MjA4MDUzMDk2N30.i7myc9A0jsBRAf4ehukJoMgl-79_GJrklch3D5_prXE'
      ),
      body := '{}'::jsonb
    );
  $$
);