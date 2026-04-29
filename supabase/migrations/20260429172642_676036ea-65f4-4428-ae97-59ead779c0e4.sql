DO $$
DECLARE
  table_name text;
  tables_to_add text[] := ARRAY[
    'package_appointment_history',
    'package_template_steps',
    'waitlist',
    'recurring_appointments'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_add LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;