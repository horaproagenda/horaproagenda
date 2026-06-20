
-- Recalculation function: closes duplicate active purchases and aligns products with their active purchase
CREATE OR REPLACE FUNCTION public.recalculate_product_cycles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH ranked AS (
    SELECT id, product_id, started_using_at,
           ROW_NUMBER() OVER (
             PARTITION BY product_id
             ORDER BY started_using_at DESC, created_at DESC
           ) AS rn,
           LAG(started_using_at) OVER (
             PARTITION BY product_id
             ORDER BY started_using_at DESC, created_at DESC
           ) AS newer_start
    FROM public.product_purchases
    WHERE started_using_at IS NOT NULL AND finished_at IS NULL
  )
  UPDATE public.product_purchases pp
     SET finished_at = GREATEST(pp.started_using_at, (r.newer_start - INTERVAL '1 day')::date)
    FROM ranked r
   WHERE pp.id = r.id
     AND r.rn > 1
     AND r.newer_start IS NOT NULL;

  WITH active AS (
    SELECT DISTINCT ON (product_id) product_id, started_using_at
    FROM public.product_purchases
    WHERE started_using_at IS NOT NULL AND finished_at IS NULL
    ORDER BY product_id, started_using_at DESC, created_at DESC
  )
  UPDATE public.products p
     SET started_using_at = a.started_using_at,
         finished_at = NULL
    FROM active a
   WHERE p.id = a.product_id
     AND (p.started_using_at IS DISTINCT FROM a.started_using_at
          OR p.finished_at IS NOT NULL);

  UPDATE public.products p
     SET finished_at = sub.last_finished
    FROM (
      SELECT pp.product_id, MAX(pp.finished_at) AS last_finished
      FROM public.product_purchases pp
      WHERE pp.finished_at IS NOT NULL
      GROUP BY pp.product_id
    ) sub
   WHERE p.id = sub.product_id
     AND p.finished_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.product_purchases pp2
       WHERE pp2.product_id = p.id
         AND pp2.started_using_at IS NOT NULL
         AND pp2.finished_at IS NULL
     );
END;
$$;

DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'recalc-product-cycles-hourly';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'recalc-product-cycles-hourly',
    '0 * * * *',
    $cron$SELECT public.recalculate_product_cycles();$cron$
  );
END $$;
