WITH base AS (
  SELECT a.account_owner_id,
         a.start_time AT TIME ZONE 'America/Sao_Paulo' AS lt,
         a.recurring_group_id, a.composite_group_id, pa.package_id
  FROM public.appointments a
  LEFT JOIN public.package_appointments pa ON pa.id = a.package_appointment_id
  WHERE a.status NOT IN ('cancelled','missed','rescheduled')
),
grp AS (
  SELECT recurring_group_id AS gid, 'recurring' AS gt, account_owner_id, lt FROM base WHERE recurring_group_id IS NOT NULL
  UNION ALL SELECT package_id, 'package', account_owner_id, lt FROM base WHERE package_id IS NOT NULL
  UNION ALL SELECT composite_group_id, 'kit', account_owner_id, lt FROM base WHERE composite_group_id IS NOT NULL
),
agg AS (
  SELECT gid, gt, min(account_owner_id::text)::uuid AS owner,
         count(DISTINCT lt::date) AS ndates,
         count(DISTINCT extract(dow FROM lt)) AS ndow, min(extract(dow FROM lt))::smallint AS dow,
         count(DISTINCT to_char(lt,'HH24:MI')) AS ntime, min(to_char(lt,'HH24:MI')) AS tm
  FROM grp GROUP BY gid, gt
)
INSERT INTO public.auto_schedule_rules (group_id, group_type, preferred_day_of_week, preferred_time, created_by)
SELECT gid, gt,
       CASE WHEN ndow = 1 AND ndates >= 2 THEN dow END,
       CASE WHEN ntime = 1 AND ndates >= 2 THEN tm END,
       owner
FROM agg
WHERE ndates >= 2 AND (ndow = 1 OR ntime = 1) AND owner IS NOT NULL
ON CONFLICT (group_id) DO NOTHING;