
CREATE OR REPLACE FUNCTION public.sync_product_usage_dates_from_purchases()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_min_started date;
  v_max_finished date;
  v_unfinished_count integer;
  v_started_count integer;
  v_new_finished date;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  IF v_product_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    MIN(started_using_at),
    MAX(finished_at),
    COUNT(*) FILTER (WHERE started_using_at IS NOT NULL AND finished_at IS NULL),
    COUNT(*) FILTER (WHERE started_using_at IS NOT NULL)
  INTO v_min_started, v_max_finished, v_unfinished_count, v_started_count
  FROM public.product_purchases
  WHERE product_id = v_product_id;

  IF v_started_count > 0 AND v_unfinished_count = 0 AND v_max_finished IS NOT NULL THEN
    v_new_finished := v_max_finished;
  ELSE
    v_new_finished := NULL;
  END IF;

  UPDATE public.products
  SET started_using_at = COALESCE(v_min_started, started_using_at),
      finished_at = v_new_finished,
      updated_at = now()
  WHERE id = v_product_id
    AND (
      started_using_at IS DISTINCT FROM COALESCE(v_min_started, started_using_at)
      OR finished_at IS DISTINCT FROM v_new_finished
    );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_usage_dates_from_purchases ON public.product_purchases;
CREATE TRIGGER trg_sync_product_usage_dates_from_purchases
AFTER INSERT OR UPDATE OF started_using_at, finished_at OR DELETE
ON public.product_purchases
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_usage_dates_from_purchases();

UPDATE public.products p
SET started_using_at = sub.min_started,
    finished_at = CASE WHEN sub.unfinished = 0 AND sub.max_finished IS NOT NULL THEN sub.max_finished ELSE NULL END,
    updated_at = now()
FROM (
  SELECT product_id,
         MIN(started_using_at) AS min_started,
         MAX(finished_at) AS max_finished,
         COUNT(*) FILTER (WHERE started_using_at IS NOT NULL AND finished_at IS NULL) AS unfinished,
         COUNT(*) FILTER (WHERE started_using_at IS NOT NULL) AS started_count
  FROM public.product_purchases
  GROUP BY product_id
) sub
WHERE p.id = sub.product_id
  AND sub.started_count > 0;
